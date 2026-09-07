import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ReviewScope } from "@ainide/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectRegistry } from "./projects.js";
import { ReviewManager } from "./review.js";
import { type AinideServer, createServer } from "./server.js";
import { saveSessionSnapshot } from "./sessions.js";

async function tempProject(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await writeFile(path.join(root, "readme.txt"), `${prefix}\n`);
  return root;
}

const execFileAsync = promisify(execFile);

async function gitIn(root: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function fakeAcpProviderScript(): string {
  return [
    "const readline = require('node:readline');",
    "const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');",
    "const options = (value) => [{ type: 'boolean', id: 'thinking', name: 'Thinking', currentValue: value === undefined ? true : value }];",
    "const rl = readline.createInterface({ input: process.stdin });",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line);",
    "  if (message.method === 'initialize') send(message.id, { protocolVersion: 1, agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {}, close: {} } }, authMethods: [] });",
    "  else if (message.method === 'session/new') send(message.id, { sessionId: 'provider-session', configOptions: options() });",
    "  else if (message.method === 'session/load') send(message.id, { configOptions: options() });",
    "  else if (message.method === 'session/set_config_option') send(message.id, { configOptions: options(message.params.value) });",
    "  else if (message.method === 'session/close') send(message.id, {});",
    "});",
  ].join("\n");
}

async function withServer(run: (server: AinideServer, sessionsPath: string) => Promise<void>, sessionsPath?: string, configPath?: string): Promise<void> {
  const filePath = sessionsPath ?? path.join(await mkdtemp(path.join(os.tmpdir(), "ainide-api-")), "sessions.json");
  const previous = process.env.AINIDE_SESSIONS;
  const previousConfig = process.env.AINIDE_CONFIG;
  process.env.AINIDE_SESSIONS = filePath;
  if (configPath) process.env.AINIDE_CONFIG = configPath;
  const server = await createServer();
  try {
    await run(server, filePath);
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.AINIDE_SESSIONS;
    else process.env.AINIDE_SESSIONS = previous;
    if (previousConfig === undefined) delete process.env.AINIDE_CONFIG;
    else process.env.AINIDE_CONFIG = previousConfig;
  }
}

function auth(token: string, json = true) {
  return json ? { "x-session-token": token, "content-type": "application/json" } : { "x-session-token": token };
}

describe("project HTTP API", () => {
  it("bootstraps a session without persisting the token", async () => {
    await withServer(async (server) => {
      const response = await server.app.inject({ method: "GET", url: "/api/session" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.token).toBe(server.token);
      expect(body.openProjects).toEqual([]);
      expect(body.knownProjects).toEqual([]);
      expect(body.activeProjectId).toBeNull();
      expect(body.workspace).toBeNull();
    });
  });

  it("opens a second project, switches, closes, and reuses a duplicate path", async () => {
    const first = await tempProject("ainide-api-a-");
    const second = await tempProject("ainide-api-b-");
    await withServer(async (server, sessionsPath) => {
      const headers = auth(server.token);
      const openedFirst = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: first } });
      expect(openedFirst.statusCode).toBe(200);
      const firstId = openedFirst.json().activeProjectId as string;
      const openedSecond = await server.app.inject({ method: "POST", url: "/api/workspace/open", headers, payload: { path: second } });
      expect(openedSecond.statusCode).toBe(200);
      expect(openedSecond.json().rootPath).toBe(await import("node:fs/promises").then((fs) => fs.realpath(second)));
      expect(server.projects.openProjects()).toHaveLength(2);
      const switched = await server.app.inject({ method: "POST", url: "/api/projects/switch", headers, payload: { projectId: firstId } });
      expect(switched.statusCode).toBe(200);
      expect(switched.json().activeProjectId).toBe(firstId);
      const duplicate = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: first } });
      expect(duplicate.json().openProjects).toHaveLength(2);
      expect(duplicate.json().activeProjectId).toBe(firstId);
      const closed = await server.app.inject({ method: "DELETE", url: "/api/projects", headers, payload: { projectId: firstId } });
      expect(closed.json().openProjects).toHaveLength(1);
      const disk = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(sessionsPath, "utf8"))) as { activeRootPath?: string };
      expect(disk.activeRootPath).toBe(closed.json().activeProjectId);
    });
  });

  it("requires a session token for file APIs and stamps projectId on events", async () => {
    const root = await tempProject("ainide-api-ev-");
    await withServer(async (server) => {
      const denied = await server.app.inject({ method: "GET", url: "/api/file?path=readme.txt" });
      expect(denied.statusCode).toBe(401);
      expect((await server.app.inject({ method: "GET", url: "/api/git/status" })).statusCode).toBe(401);
      const headers = auth(server.token);
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      const status = await server.app.inject({ method: "GET", url: "/api/git/status", headers });
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({ isRepository: false, dirty: false, files: [] });
      const events: Array<{ type: string; projectId?: string }> = [];
      server.projects.activeManager?.onEvent((event) => events.push(event));
      await server.projects.requireActive().refreshGit();
      expect(events.some((event) => event.type === "git_changed" && event.projectId === server.projects.activeId)).toBe(true);
    });
  });

  it("browses immediate directory children without project side effects", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-picker-"));
    const child = path.join(root, "child");
    const hidden = path.join(root, ".hidden");
    const nested = path.join(child, "nested");
    const linkTarget = await mkdtemp(path.join(os.tmpdir(), "ainide-picker-link-target-"));
    await mkdir(nested, { recursive: true });
    await mkdir(hidden);
    await writeFile(path.join(root, "file.txt"), "not returned");
    const link = path.join(root, "linked");
    await symlink(linkTarget, link);

    await withServer(async (server) => {
      const url = `/api/workspace/children?path=${encodeURIComponent(root)}`;
      expect((await server.app.inject({ method: "GET", url })).statusCode).toBe(401);
      const before = { active: server.projects.activeId, known: server.projects.knownProjects() };
      const response = await server.app.inject({ method: "GET", url, headers: auth(server.token, false) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        currentPath: await realpath(root),
        parentPath: await realpath(path.dirname(root)),
        homePath: await realpath(os.homedir()),
        children: [
          { name: ".hidden", path: await realpath(hidden) },
          { name: "child", path: await realpath(child) },
          { name: "linked", path: await realpath(linkTarget) },
        ],
      });
      expect(server.projects.activeId).toBe(before.active);
      expect(server.projects.knownProjects()).toEqual(before.known);

      const filtered = await server.app.inject({
        method: "GET",
        url: `${url}&query=child`,
        headers: auth(server.token, false),
      });
      expect(filtered.statusCode).toBe(200);
      expect(filtered.json().children).toEqual([{ name: "child", path: await realpath(child) }]);
      expect(filtered.json().children[0].path).not.toContain("nested");
    });
  });

  it("rejects invalid directory browsing paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-picker-errors-"));
    const file = path.join(root, "file.txt");
    await writeFile(file, "file");
    await withServer(async (server) => {
      const headers = auth(server.token, false);
      for (const requestedPath of [file, path.join(root, "missing"), "relative/path", "~other-user"]) {
        const response = await server.app.inject({
          method: "GET",
          url: `/api/workspace/children?path=${encodeURIComponent(requestedPath)}`,
          headers,
        });
        expect(response.statusCode).toBe(400);
      }
    });
  });

  it("restores last-active on startup and reports a missing path as recoverable", async () => {
    const root = await tempProject("ainide-api-restore-");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-api-snap-"));
    const sessionsPath = path.join(dir, "sessions.json");
    await saveSessionSnapshot({
      version: 1,
      activeRootPath: root,
      projects: [{
        rootPath: root,
        name: "restored",
        openFilePaths: ["readme.txt"],
        panes: { primary: { tabPaths: ["readme.txt"] }, secondary: { tabPaths: [] } },
        secondaryOpen: false,
        expandedPaths: [],
        mode: "edit",
        terminalKinds: ["shell"],
      }],
    }, sessionsPath);
    await withServer(async (server) => {
      expect(server.restoreError).toBeUndefined();
      expect(server.projects.activeId).toBeTruthy();
      expect(server.terminals.list(server.projects.activeId).some((session) => session.kind === "shell")).toBe(true);
    }, sessionsPath);

    const lazygitSessionsPath = path.join(dir, "lazygit-restore.json");
    await saveSessionSnapshot({
      version: 1,
      activeRootPath: root,
      projects: [{
        rootPath: root,
        name: "lazygit-restored",
        openFilePaths: [],
        panes: { primary: { tabPaths: [] }, secondary: { tabPaths: [] } },
        secondaryOpen: false,
        expandedPaths: [],
        mode: "lazygit",
        terminalKinds: ["lazygit"],
      }],
    }, lazygitSessionsPath);
    await withServer(async (server) => {
      expect(server.projects.snapshotFor(server.projects.activeId!)?.mode).toBe("lazygit");
      expect(server.terminals.list(server.projects.activeId).some((session) => session.kind === "lazygit" || session.kind === "shell")).toBe(true);
    }, lazygitSessionsPath);

    const missingPath = path.join(dir, "gone-project");
    const missingSessions = path.join(dir, "missing.json");
    await saveSessionSnapshot({
      version: 1,
      activeRootPath: missingPath,
      projects: [{
        rootPath: missingPath,
        name: "gone-project",
        openFilePaths: [],
        panes: { primary: { tabPaths: [] }, secondary: { tabPaths: [] } },
        secondaryOpen: false,
        expandedPaths: [],
        mode: "edit",
        terminalKinds: [],
      }],
    }, missingSessions);
    await withServer(async (server) => {
      expect(server.restoreError).toMatch(/Could not open last project/);
      expect(server.projects.currentWorkspace).toBeUndefined();
      const session = await server.app.inject({ method: "GET", url: "/api/session" });
      expect(session.json().restoreError).toMatch(/Could not open last project/);
      expect(session.json().knownProjects).toEqual([expect.objectContaining({ name: "gone-project" })]);
    }, missingSessions);
  });

  it("restores every recorded agent descriptor and falls back to legacy agent kinds", async () => {
    const root = await tempProject("ainide-api-agent-restore-");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-api-agent-snap-"));
    const configPath = path.join(dir, "config.json");
    await writeFile(configPath, JSON.stringify({ agentCommand: "sleep 30", defaultShell: "/bin/sh" }));
    const sessionsPath = path.join(dir, "sessions.json");
    await saveSessionSnapshot({
      version: 1,
      activeRootPath: root,
      projects: [{
        rootPath: root,
        name: "restored",
        openFilePaths: [],
        panes: { primary: { tabPaths: [] }, secondary: { tabPaths: [] } },
        secondaryOpen: false,
        expandedPaths: [],
        mode: "agents",
        terminalKinds: ["agent"],
        agentSessions: [{ title: "Implement" }, { title: "Plan next task" }],
      }],
    }, sessionsPath);
    await withServer(async (server) => {
      const agents = server.terminals.list(server.projects.activeId).filter((session) => session.kind === "agent");
      expect(agents.map((session) => session.title)).toEqual(["Implement", "Plan next task"]);
      expect(agents.every((session) => session.command === "sleep 30")).toBe(true);
    }, sessionsPath, configPath);

    const legacySessionsPath = path.join(dir, "legacy-sessions.json");
    await saveSessionSnapshot({
      version: 1,
      activeRootPath: root,
      projects: [{
        rootPath: root,
        name: "legacy",
        openFilePaths: [],
        panes: { primary: { tabPaths: [] }, secondary: { tabPaths: [] } },
        secondaryOpen: false,
        expandedPaths: [],
        mode: "edit",
        terminalKinds: ["agent"],
      }],
    }, legacySessionsPath);
    await withServer(async (server) => {
      const agents = server.terminals.list(server.projects.activeId).filter((session) => session.kind === "agent");
      expect(agents).toHaveLength(1);
      expect(agents[0]).toEqual(expect.objectContaining({ title: "Agent", command: "sleep 30" }));
    }, legacySessionsPath, configPath);
  });

  it("does not let project snapshots replace server-owned live session descriptors", async () => {
    const root = await tempProject("ainide-api-snapshot-ownership-");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-api-snapshot-ownership-snap-"));
    const configPath = path.join(dir, "config.json");
    await writeFile(configPath, JSON.stringify({
      agentCommand: "sleep 30",
      defaultShell: "/bin/sh",
      acpAgents: [{ id: "fake", label: "Fake ACP", command: process.execPath, args: ["-e", fakeAcpProviderScript()] }],
    }));
    const sessionsPath = path.join(dir, "sessions.json");
    await saveSessionSnapshot({
      version: 1,
      activeRootPath: root,
      projects: [{
        rootPath: root,
        name: "server-owned",
        openFilePaths: [],
        panes: { primary: { tabPaths: [] }, secondary: { tabPaths: [] } },
        secondaryOpen: false,
        expandedPaths: [],
        mode: "edit",
        terminalKinds: ["agent"],
        agentSessions: [{ title: "Server-owned PTY" }],
        acpSessions: [{
          id: "server-owned-acp",
          title: "Server-owned ACP",
          providerId: "fake",
          acpSessionId: "provider-session",
          resumability: "resumable",
          titleSource: "user",
        }],
      }],
    }, sessionsPath);

    await withServer(async (server) => {
      const headers = auth(server.token);
      const opened = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      expect(opened.statusCode).toBe(200);
      const projectId = server.projects.activeId!;
      const baseline = server.projects.snapshotFor(projectId)!;
      expect(server.terminals.list(projectId)).toEqual([expect.objectContaining({ kind: "agent", title: "Server-owned PTY", alive: true })]);
      expect(server.acp.list(projectId)).toEqual([expect.objectContaining({ id: "server-owned-acp", acpSessionId: "provider-session", status: "live" })]);

      const response = await server.app.inject({
        method: "PUT",
        url: "/api/projects/snapshot",
        headers,
        payload: {
          projectId,
          openFilePaths: ["readme.txt"],
          panes: { primary: { tabPaths: ["readme.txt"], activePath: "readme.txt" }, secondary: { tabPaths: [] } },
          secondaryOpen: true,
          expandedPaths: ["src"],
          mode: "agents",
          terminalKinds: ["agent", "custom", "forged-kind"],
          agentSessions: [{ title: "Attacker PTY", pid: 123, command: "evil-command" }],
          acpSessions: [{
            id: "attacker-acp",
            title: "Attacker ACP",
            providerId: "fake",
            acpSessionId: "attacker-provider-session",
            resumability: "resumable",
            titleSource: "user",
          }],
          delegations: [{ id: "attacker-delegation", sessionId: "server-owned-acp" }],
          agentSnapshot: { delegations: [{ id: "attacker-legacy-delegation" }] },
          subagents: [{ id: "attacker-subagent", providerId: "fake" }],
        },
      });

      expect(response.statusCode).toBe(200);
      const returned = response.json().snapshot;
      expect(returned).toMatchObject({
        openFilePaths: ["readme.txt"],
        panes: { primary: { tabPaths: ["readme.txt"], activePath: "readme.txt" }, secondary: { tabPaths: [] } },
        secondaryOpen: true,
        expandedPaths: ["src"],
        mode: "agents",
        terminalKinds: ["agent", "custom"],
      });
      expect(returned.agentSessions).toEqual(baseline.agentSessions);
      expect(returned.acpSessions).toEqual(baseline.acpSessions);
      expect(returned).not.toHaveProperty("delegations");
      expect(returned).not.toHaveProperty("agentSnapshot");
      expect(returned).not.toHaveProperty("subagents");
      expect(server.projects.snapshotFor(projectId)).toEqual(returned);
      expect(server.terminals.list(projectId)).toEqual([expect.objectContaining({ kind: "agent", title: "Server-owned PTY", alive: true })]);
      expect(server.acp.list(projectId)).toEqual([expect.objectContaining({ id: "server-owned-acp", acpSessionId: "provider-session", status: "live" })]);
    }, sessionsPath, configPath);
  });

  it("limits terminal listing, rename, and removal to the active project", async () => {
    const first = await tempProject("ainide-api-terminal-owner-a-");
    const second = await tempProject("ainide-api-terminal-owner-b-");
    await withServer(async (server) => {
      const headers = auth(server.token);
      const opened = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: first } });
      const firstId = opened.json().activeProjectId as string;
      const created = await server.app.inject({ method: "POST", url: "/api/terminals", headers, payload: { kind: "agent", title: "First" } });
      const terminalId = created.json().id as string;
      const other = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: second } });

      expect((await server.app.inject({ method: "GET", url: "/api/terminals", headers })).json()).toEqual([]);
      expect((await server.app.inject({ method: "PATCH", url: `/api/terminals/${terminalId}`, headers, payload: { title: "Wrong project" } })).statusCode).toBe(404);
      expect((await server.app.inject({ method: "DELETE", url: `/api/terminals/${terminalId}`, headers, payload: {} })).statusCode).toBe(404);
      await server.app.inject({ method: "POST", url: "/api/projects/switch", headers, payload: { projectId: firstId } });
      expect((await server.app.inject({ method: "PATCH", url: `/api/terminals/${terminalId}`, headers, payload: { title: "Renamed" } })).json().title).toBe("Renamed");
      expect((await server.app.inject({ method: "GET", url: "/api/terminals", headers })).json()).toEqual([expect.objectContaining({ id: terminalId, title: "Renamed" })]);
      expect(other.json().activeProjectId).not.toBe(firstId);
    });
  });

  it("persists ACP provider preferences and reapplies them to a new session after restart", async () => {
    const root = await tempProject("ainide-api-acp-preference-");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-api-acp-preference-snap-"));
    const sessionsPath = path.join(dir, "sessions.json");
    const configPath = path.join(dir, "config.json");
    await writeFile(configPath, JSON.stringify({ acpAgents: [{ id: "fake", label: "Fake ACP", command: process.execPath, args: ["-e", fakeAcpProviderScript()] }] }));

    await withServer(async (server) => {
      const headers = auth(server.token);
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers, payload: { providerId: "fake", title: "First" } });
      expect(created.statusCode).toBe(200);
      const sessionId = created.json().id as string;
      const changed = await server.app.inject({ method: "POST", url: `/api/acp/sessions/${sessionId}/config`, headers, payload: { configId: "thinking", value: false } });
      expect(changed.statusCode).toBe(200);
      expect(changed.json().options[0].currentValue).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 350));
      const debounced = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(sessionsPath, "utf8"))) as { acpProviderPreferences?: unknown };
      expect(debounced.acpProviderPreferences).toEqual([{ providerId: "fake", values: { thinking: false } }]);
    }, sessionsPath, configPath);

    const saved = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(sessionsPath, "utf8"))) as { acpProviderPreferences?: unknown };
    expect(saved.acpProviderPreferences).toEqual([{ providerId: "fake", values: { thinking: false } }]);

    await withServer(async (server) => {
      const headers = auth(server.token);
      expect(server.acp.list(server.projects.activeId)).toHaveLength(1);
      const bootstrap = await server.app.inject({ method: "GET", url: "/api/session" });
      expect(bootstrap.json().snapshot).not.toHaveProperty("acpProviderPreferences");
      const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers, payload: { providerId: "fake", title: "Second" } });
      expect(created.statusCode).toBe(200);
      expect(created.json().configOptions[0].currentValue).toBe(false);
    }, sessionsPath, configPath);
  });

  it("reads and updates a project's agent banlist, validates input, and persists it", async () => {
    const root = await tempProject("ainide-api-agents-");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-api-agents-snap-"));
    const configPath = path.join(dir, "config.json");
    await writeFile(configPath, JSON.stringify({
      acpAgents: [
        { id: "cursor", label: "Cursor", command: "cursor", args: ["acp"] },
        { id: "opencode", label: "OpenCode", command: "opencode", args: ["acp"] },
        { id: "gemini", label: "Gemini", command: "gemini", args: ["acp"] },
      ],
    }));

    await withServer(async (server) => {
      const headers = auth(server.token);
      const opened = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      expect(opened.statusCode).toBe(200);
      const rootPath = opened.json().activeProjectId as string;

      const read = await server.app.inject({ method: "GET", url: "/api/project/agents", headers });
      expect(read.statusCode).toBe(200);
      expect(read.json()).toEqual({
        all: [
          { id: "cursor", label: "Cursor" },
          { id: "opencode", label: "OpenCode" },
          { id: "gemini", label: "Gemini" },
        ],
        disabled: [],
      });

      const updated = await server.app.inject({
        method: "PATCH",
        url: "/api/project/agents",
        headers,
        payload: { rootPath, disabledAgents: ["gemini", "not-configured"] },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().disabled).toEqual(["gemini"]);

      expect(server.acp.providers(rootPath).map((provider) => provider.id)).toEqual(["cursor", "opencode"]);
      expect(server.acp.providers().map((provider) => provider.id)).toEqual(["cursor", "opencode", "gemini"]);

      const reread = await server.app.inject({ method: "GET", url: "/api/project/agents", headers });
      expect(reread.json().disabled).toEqual(["gemini"]);

      const onDisk = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(configPath, "utf8"))) as { projects?: Record<string, { disabledAgents: string[] }> };
      expect(onDisk.projects?.[rootPath]).toEqual({ disabledAgents: ["gemini"] });

      const unknown = await server.app.inject({
        method: "PATCH",
        url: "/api/project/agents",
        headers,
        payload: { rootPath: "/not/a/project", disabledAgents: ["gemini"] },
      });
      expect(unknown.statusCode).toBe(404);
      const onDiskAfterUnknown = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(configPath, "utf8"))) as { projects?: Record<string, unknown> };
      expect(onDiskAfterUnknown.projects?.["/not/a/project"]).toBeUndefined();
    }, undefined, configPath);
  });

  it("updates the banlist for a root path with spaces and non-ASCII characters", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "ainide-api-special-"));
    const root = path.join(base, "my proj/ünïcode");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "readme.txt"), "special\n");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-api-special-snap-"));
    const configPath = path.join(dir, "config.json");
    await writeFile(configPath, JSON.stringify({
      acpAgents: [
        { id: "cursor", label: "Cursor", command: "cursor", args: ["acp"] },
        { id: "gemini", label: "Gemini", command: "gemini", args: ["acp"] },
      ],
    }));

    await withServer(async (server) => {
      const headers = auth(server.token);
      const opened = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      expect(opened.statusCode).toBe(200);
      const rootPath = opened.json().activeProjectId as string;

      const updated = await server.app.inject({
        method: "PATCH",
        url: "/api/project/agents",
        headers,
        payload: { rootPath, disabledAgents: ["gemini"] },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().disabled).toEqual(["gemini"]);

      const read = await server.app.inject({ method: "GET", url: "/api/project/agents", headers });
      expect(read.json().disabled).toEqual(["gemini"]);
      expect(server.acp.providers(rootPath).map((provider) => provider.id)).toEqual(["cursor"]);

      const onDisk = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(configPath, "utf8"))) as { projects?: Record<string, { disabledAgents: string[] }> };
      expect(onDisk.projects?.[rootPath]).toEqual({ disabledAgents: ["gemini"] });
    }, undefined, configPath);
  });

  it("reads and replaces a project's build commands over the builds API", async () => {
    const root = await tempProject("ainide-api-builds-");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-api-builds-snap-"));
    const configPath = path.join(dir, "config.json");

    await withServer(async (server) => {
      const headers = auth(server.token);
      expect((await server.app.inject({ method: "GET", url: "/api/project/builds", headers })).statusCode).toBe(409);

      const opened = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      expect(opened.statusCode).toBe(200);
      const rootPath = opened.json().activeProjectId as string;

      const empty = await server.app.inject({ method: "GET", url: "/api/project/builds", headers });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual({ commands: [] });

      const commands = [{ label: "Build", command: "npm run build" }, { label: "Test", command: "npm test" }];
      const updated = await server.app.inject({ method: "PATCH", url: "/api/project/builds", headers, payload: { rootPath, commands } });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toEqual({ ok: true, rootPath, commands });

      const reread = await server.app.inject({ method: "GET", url: "/api/project/builds", headers });
      expect(reread.json().commands).toEqual(commands);

      const explicit = await server.app.inject({ method: "GET", url: `/api/project/builds?projectId=${encodeURIComponent(rootPath)}`, headers });
      expect(explicit.json().commands).toEqual(commands);

      const onDisk = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(configPath, "utf8"))) as { projects?: Record<string, { buildCommands: unknown }> };
      expect(onDisk.projects?.[rootPath]?.buildCommands).toEqual(commands);
    }, undefined, configPath);
  });

  it("rejects invalid build command updates and leaves the stored list unchanged", async () => {
    const root = await tempProject("ainide-api-builds-reject-");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-api-builds-snap-"));
    const configPath = path.join(dir, "config.json");
    const saved = [{ label: "Build", command: "npm run build" }];

    await withServer(async (server) => {
      const headers = auth(server.token);
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      const rootPath = server.projects.activeId as string;
      await server.app.inject({ method: "PATCH", url: "/api/project/builds", headers, payload: { rootPath, commands: saved } });

      const attempt = async (commands: unknown) => (await server.app.inject({ method: "PATCH", url: "/api/project/builds", headers, payload: { rootPath, commands } })).statusCode;
      expect(await attempt([{ label: "", command: "npm run build" }])).toBe(400);
      expect(await attempt([{ label: " x ", command: "  " }])).toBe(400);
      expect(await attempt([{ label: "Build" }])).toBe(400);
      expect(await attempt([{ label: "x".repeat(81), command: "y" }])).toBe(400);
      expect(await attempt([{ label: "x", command: "y".repeat(501) }])).toBe(400);
      expect(await attempt(Array.from({ length: 21 }, (_, index) => ({ label: `L${index}`, command: "c" })))).toBe(400);
      expect(await attempt("not-an-array")).toBe(400);
      expect(await attempt([{ label: "ok", command: "c" }, 42])).toBe(400);

      const reread = await server.app.inject({ method: "GET", url: "/api/project/builds", headers });
      expect(reread.json().commands).toEqual(saved);

      const unknown = await server.app.inject({ method: "PATCH", url: "/api/project/builds", headers, payload: { rootPath: "/not/a/project", commands: [{ label: "x", command: "y" }] } });
      expect(unknown.statusCode).toBe(404);
      const unknownRead = await server.app.inject({ method: "GET", url: `/api/project/builds?projectId=${encodeURIComponent("/not/a/project")}`, headers });
      expect(unknownRead.statusCode).toBe(404);

      const onDisk = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(configPath, "utf8"))) as { projects?: Record<string, unknown> };
      expect(onDisk.projects?.["/not/a/project"]).toBeUndefined();
    }, undefined, configPath);
  });

  it("sets build commands for a root path with spaces, non-ASCII, and __proto__", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "ainide-api-builds-special-"));
    const root = path.join(base, "my proj/ünïcode");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "readme.txt"), "special\n");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-api-builds-snap-"));
    const configPath = path.join(dir, "config.json");

    await withServer(async (server) => {
      const headers = auth(server.token);
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      const rootPath = server.projects.activeId as string;

      const commands = [{ label: "特", command: "echo 'héllo wörld'" }, { label: "quote \" label", command: "make && echo done" }];
      const updated = await server.app.inject({ method: "PATCH", url: "/api/project/builds", headers, payload: { rootPath, commands } });
      expect(updated.statusCode).toBe(200);

      const reread = await server.app.inject({ method: "GET", url: "/api/project/builds", headers });
      expect(reread.json().commands).toEqual(commands);

      const second = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      expect(second.json().activeProjectId).toBe(rootPath);

      const onDisk = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(configPath, "utf8"))) as { projects?: Record<string, { buildCommands: unknown }> };
      expect(onDisk.projects?.[rootPath]?.buildCommands).toEqual(commands);
      expect(Object.keys(onDisk.projects ?? {})).not.toContain("__proto__");
    }, undefined, configPath);
  });

  it("writes activeRootPath when switching projects", async () => {
    const first = await tempProject("ainide-api-pers-a-");
    const second = await tempProject("ainide-api-pers-b-");
    await withServer(async (server, sessionsPath) => {
      const headers = auth(server.token);
      const a = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: first } });
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: second } });
      const firstId = a.json().activeProjectId as string;
      await server.app.inject({ method: "POST", url: "/api/projects/switch", headers, payload: { projectId: firstId } });
      const disk = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(sessionsPath, "utf8"))) as { activeRootPath: string };
      expect(disk.activeRootPath).toBe(firstId);
    });
  });

  it("supports file delete, rename, and create routes with path safety", async () => {
    const root = await tempProject("ainide-api-file-");
    await withServer(async (server) => {
      const headers = auth(server.token);
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: root } });
      const created = await server.app.inject({ method: "POST", url: "/api/file/create", headers, payload: { path: "docs/new.md", type: "file" } });
      expect(created.statusCode).toBe(200);
      const renamed = await server.app.inject({ method: "POST", url: "/api/file/rename", headers, payload: { from: "docs/new.md", to: "docs/renamed.md" } });
      expect(renamed.statusCode).toBe(200);
      const deleted = await server.app.inject({ method: "DELETE", url: "/api/file?path=docs/renamed.md", headers: auth(server.token, false) });
      expect(deleted.statusCode).toBe(200);
      const denied = await server.app.inject({ method: "DELETE", url: "/api/file?path=../../../../etc/passwd", headers: auth(server.token, false) });
      expect(denied.statusCode).toBe(400);
      const conflict = await server.app.inject({ method: "POST", url: "/api/file/create", headers, payload: { path: "readme.txt", type: "file" } });
      expect(conflict.statusCode).toBe(400);
    });
  });

  it("guards the git comparison route with auth, path safety, and active project", async () => {
    const root = await tempProject("ainide-api-cmp-");
    await withServer(async (server) => {
      const headers = auth(server.token, false);
      expect((await server.app.inject({ method: "GET", url: "/api/git/compare?path=readme.txt" })).statusCode).toBe(401);
      expect((await server.app.inject({ method: "GET", url: "/api/git/compare?path=readme.txt", headers })).statusCode).toBe(400);
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth(server.token), payload: { path: root } });
      expect((await server.app.inject({ method: "GET", url: `/api/git/compare?path=${encodeURIComponent("/etc/passwd")}`, headers })).statusCode).toBe(400);
      expect((await server.app.inject({ method: "GET", url: "/api/git/compare?path=../../../../etc/passwd", headers })).statusCode).toBe(400);
      const ok = await server.app.inject({ method: "GET", url: "/api/git/compare?path=readme.txt", headers });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ path: "readme.txt", isRepository: false, baseline: "unavailable", unavailableReason: "non-repository" });
    });
  });

  it("rejects symlink escapes on the git comparison route", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "ainide-api-cmp-link-"));
    const root = path.join(parent, "root");
    const outside = path.join(parent, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(outside, "secret.txt"), "no\n");
    await symlink(outside, path.join(root, "link"));
    await withServer(async (server) => {
      const headers = auth(server.token, false);
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth(server.token), payload: { path: root } });
      const denied = await server.app.inject({ method: "GET", url: "/api/git/compare?path=link/secret.txt", headers });
      expect(denied.statusCode).toBe(400);
    });
  });

  it("returns stable comparison shapes for clean, changed, untracked, deleted, renamed, and exceptional files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-api-cmp-shapes-"));
    await gitIn(root, ["init", "-q"]);
    await gitIn(root, ["config", "user.email", "t@e.com"]);
    await gitIn(root, ["config", "user.name", "T"]);
    await writeFile(path.join(root, "clean.txt"), "clean\n");
    await writeFile(path.join(root, "changed.txt"), "before\n");
    await writeFile(path.join(root, "deleted.txt"), "deleted\n");
    await writeFile(path.join(root, "old.txt"), "moved\n");
    await writeFile(path.join(root, "blob.bin"), Buffer.from([0, 1, 2, 0]));
    await gitIn(root, ["add", "-A"]);
    await gitIn(root, ["commit", "-q", "-m", "initial"]);
    await writeFile(path.join(root, "changed.txt"), "after\n");
    await rm(path.join(root, "deleted.txt"));
    await gitIn(root, ["mv", "old.txt", "renamed.txt"]);
    await writeFile(path.join(root, "untracked.txt"), "new\n");

    await withServer(async (server) => {
      const headers = auth(server.token, false);
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth(server.token), payload: { path: root } });
      const get = (p: string) => server.app.inject({ method: "GET", url: `/api/git/compare?path=${encodeURIComponent(p)}`, headers });
      const clean = await get("clean.txt");
      expect(clean.statusCode).toBe(200);
      expect(clean.json()).toMatchObject({ path: "clean.txt", status: "clean", baseline: "head", isRepository: true });
      expect(clean.json().content).toBe("clean\n");
      const changed = await get("changed.txt");
      expect(changed.json()).toMatchObject({ path: "changed.txt", status: "modified", baseline: "head" });
      expect(changed.json().content).toBe("before\n");
      const untracked = await get("untracked.txt");
      expect(untracked.json()).toMatchObject({ path: "untracked.txt", status: "untracked", baseline: "empty", content: "" });
      const deleted = await get("deleted.txt");
      expect(deleted.json()).toMatchObject({ path: "deleted.txt", status: "deleted", baseline: "head", content: "deleted\n" });
      const renamed = await get("renamed.txt");
      expect(renamed.json()).toMatchObject({ path: "renamed.txt", status: "renamed", previousPath: "old.txt", baseline: "head", content: "moved\n" });
      const binary = await get("blob.bin");
      expect(binary.json()).toMatchObject({ path: "blob.bin", baseline: "unavailable", unavailableReason: "binary" });
      expect(binary.json().content).toBeUndefined();
    });
  });
});

describe("review bound to the active project", () => {
  const registries: ProjectRegistry[] = [];
  afterEach(async () => {
    await Promise.all(registries.splice(0).map((registry) => registry.closeAll()));
  });

  it("starts review with the active project cwd and stops on switch", async () => {
    const first = await tempProject("ainide-rev-a-");
    const second = await tempProject("ainide-rev-b-");
    const registry = new ProjectRegistry();
    registries.push(registry);
    const spawned: Array<{ cwd?: string }> = [];
    const review = new ReviewManager(() => registry.currentWorkspace?.rootPath, {
      isCommandAvailable: () => true,
      waitForHttpReady: async () => ({ ok: true }),
      spawn: vi.fn((...args: unknown[]) => {
        const options = args[2] as { cwd?: string };
        spawned.push({ cwd: options?.cwd });
        return {
          pid: 99,
          once: vi.fn(),
          kill: vi.fn(),
          stdout: null,
          stderr: null,
        };
      }) as unknown as typeof import("node:child_process").spawn,
    });
    await registry.open(first);
    const started = await review.start("working-tree" as ReviewScope, true);
    expect(started.url).toBeDefined();
    expect(spawned[0]?.cwd).toBe(registry.activeId);
    await review.stop();
    await registry.open(second);
    expect(review.getStatus().running).toBe(false);
    expect(review.getStatus().url).toBeUndefined();
    const startedAgain = await review.start("working-tree", true);
    expect(spawned[1]?.cwd).toBe(registry.activeId);
    expect(startedAgain.url).toBeDefined();
    await review.stop();
  });
});

describe("version endpoint", () => {
  it("returns current/latest/notesUrl and rejects requests without a token", async () => {
    const sessionsPath = path.join(await mkdtemp(path.join(os.tmpdir(), "ainide-version-api-")), "sessions.json");
    const previous = process.env.AINIDE_SESSIONS;
    process.env.AINIDE_SESSIONS = sessionsPath;
    const server = await createServer({ update: { current: "v1.0.0", latest: "v2.0.0", notesUrl: "https://example.com/v2.0.0" } });
    try {
      const denied = await server.app.inject({ method: "GET", url: "/api/version" });
      expect(denied.statusCode).toBe(401);
      const ok = await server.app.inject({ method: "GET", url: "/api/version", headers: { "x-session-token": server.token } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toEqual({ current: "v1.0.0", latest: "v2.0.0", notesUrl: "https://example.com/v2.0.0" });
    } finally {
      await server.close();
      if (previous === undefined) delete process.env.AINIDE_SESSIONS;
      else process.env.AINIDE_SESSIONS = previous;
    }
  });

  it("returns only current when no newer release is known", async () => {
    const sessionsPath = path.join(await mkdtemp(path.join(os.tmpdir(), "ainide-version-api-2-")), "sessions.json");
    const previous = process.env.AINIDE_SESSIONS;
    process.env.AINIDE_SESSIONS = sessionsPath;
    const server = await createServer({ update: { current: "v2.0.0" } });
    try {
      const ok = await server.app.inject({ method: "GET", url: "/api/version", headers: { "x-session-token": server.token } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toEqual({ current: "v2.0.0" });
    } finally {
      await server.close();
      if (previous === undefined) delete process.env.AINIDE_SESSIONS;
      else process.env.AINIDE_SESSIONS = previous;
    }
  });
});

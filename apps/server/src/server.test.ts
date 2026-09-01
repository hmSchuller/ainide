import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewScope } from "@ainide/shared";
import { createServer, type AinideServer } from "./server.js";
import { saveSessionSnapshot } from "./sessions.js";
import { ProjectRegistry } from "./projects.js";
import { ReviewManager } from "./review.js";

async function tempProject(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await writeFile(path.join(root, "readme.txt"), `${prefix}\n`);
  return root;
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

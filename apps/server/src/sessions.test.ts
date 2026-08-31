import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAppMode, type ProjectSessionSnapshot } from "@ainide/shared";
import { emptyProjectSnapshot } from "./projects.js";
import { loadSessionSnapshot, parseSessionSnapshot, sanitizeSnapshot, saveSessionSnapshot } from "./sessions.js";

describe("session snapshots", () => {
  it("round-trips paths and layout without contents or token", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-sessions-"));
    const filePath = path.join(dir, "sessions.json");
    const workspace = { rootPath: "/tmp/demo-project", name: "demo-project" };
    const snapshot = {
      version: 1,
      activeRootPath: workspace.rootPath,
      projects: [{
        ...emptyProjectSnapshot(workspace),
        openFilePaths: ["src/index.ts"],
        panes: { primary: { tabPaths: ["src/index.ts"], activePath: "src/index.ts" }, secondary: { tabPaths: [] } },
        expandedPaths: ["src"],
        mode: "edit" as const,
        terminalKinds: ["agent" as const, "shell" as const],
      }],
    };
    await saveSessionSnapshot({
      ...snapshot,
      projects: [{
        ...snapshot.projects[0],
        ...( { token: "secret-token", content: "UNSAVED BUFFER" } as Record<string, unknown> ),
      } as typeof snapshot.projects[0]],
    }, filePath);
    const raw = await readFile(filePath, "utf8");
    expect(raw).not.toContain("secret-token");
    expect(raw).not.toContain("UNSAVED BUFFER");
    expect(raw).not.toMatch(/"token"/);
    expect(raw).not.toMatch(/"content"/);
    const loaded = await loadSessionSnapshot(filePath);
    expect(loaded).toEqual(snapshot);
  });

  it("parses missing, single, and multiple agent descriptors without confusing terminal kinds", () => {
    const project = {
      rootPath: "/tmp/demo-project",
      name: "demo-project",
      openFilePaths: [],
      panes: { primary: { tabPaths: [] }, secondary: { tabPaths: [] } },
      secondaryOpen: false,
      expandedPaths: [],
      mode: "agents",
      terminalKinds: ["agent", "shell"],
    };
    expect(parseSessionSnapshot({ version: 1, projects: [project] })?.projects[0]).not.toHaveProperty("agentSessions");
    expect(parseSessionSnapshot({ version: 1, projects: [{ ...project, agentSessions: [{ title: "Implement" }] }] })?.projects[0].agentSessions).toEqual([{ title: "Implement" }]);
    expect(parseSessionSnapshot({ version: 1, projects: [{ ...project, agentSessions: [{ title: "Implement" }, { title: "Plan next task" }] }] })?.projects[0].agentSessions).toEqual([
      { title: "Implement" },
      { title: "Plan next task" },
    ]);
    expect(parseSessionSnapshot({ version: 1, projects: [{ ...project, agentSessions: [{ title: " ", pid: 12 }, { title: 42 }] }] })?.projects[0].agentSessions).toEqual([]);
  });

  it("parses ACP descriptors separately from legacy PTY agents", () => {
    const project = {
      rootPath: "/tmp/demo-project",
      name: "demo-project",
      openFilePaths: [],
      panes: { primary: { tabPaths: [] }, secondary: { tabPaths: [] } },
      secondaryOpen: false,
      expandedPaths: [],
      mode: "agents",
      terminalKinds: ["agent"],
    };
    const parsed = parseSessionSnapshot({ version: 1, projects: [{
      ...project,
      agentSessions: [{ title: "PTY agent" }],
      acpSessions: [
        { id: "local-1", title: "OpenCode", providerId: "opencode", acpSessionId: "provider-1", resumability: "resumable", token: "secret" },
        { id: "invalid", title: "Missing provider" },
      ],
    }] })?.projects[0];
    expect(parsed?.agentSessions).toEqual([{ title: "PTY agent" }]);
    expect(parsed?.acpSessions).toEqual([{ id: "local-1", title: "OpenCode", providerId: "opencode", acpSessionId: "provider-1", resumability: "resumable" }]);
  });

  it("persists only title metadata for agents and excludes forbidden session data", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-agent-sessions-"));
    const filePath = path.join(dir, "sessions.json");
    const project = {
      ...emptyProjectSnapshot({ rootPath: "/tmp/demo-project", name: "demo-project" }),
      agentSessions: [{
        title: "Implement",
        token: "secret-token",
        ptyId: "pty-secret",
        processId: 123,
        pid: 456,
        scrollback: "output",
        command: "secret command",
        referenceKit: "secret references",
        content: "reference content",
      }],
    } as unknown as ProjectSessionSnapshot;
    await saveSessionSnapshot({ version: 1, projects: [project] }, filePath);
    const raw = await readFile(filePath, "utf8");
    for (const forbidden of ["secret-token", "pty-secret", "processId", "scrollback", "secret command", "secret references", "reference content"]) {
      expect(raw).not.toContain(forbidden);
    }
    expect(JSON.parse(raw).projects[0].agentSessions).toEqual([{ title: "Implement" }]);
  });

  it("persists ACP identity and resumability without secrets or protocol data", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-acp-sessions-"));
    const filePath = path.join(dir, "sessions.json");
    const project = {
      ...emptyProjectSnapshot({ rootPath: "/tmp/demo-project", name: "demo-project" }),
      acpSessions: [{
        id: "local-1",
        title: "Review",
        providerId: "cursor",
        acpSessionId: "provider-session-1",
        resumability: "resumable",
        token: "secret-token",
        content: "transcript",
        env: { API_KEY: "secret" },
      }],
    } as unknown as ProjectSessionSnapshot;
    await saveSessionSnapshot({ version: 1, projects: [project] }, filePath);
    const raw = await readFile(filePath, "utf8");
    for (const forbidden of ["secret-token", "transcript", "API_KEY", "provider-session-1x"]) expect(raw).not.toContain(forbidden);
    expect(JSON.parse(raw).projects[0].acpSessions).toEqual([{
      id: "local-1",
      title: "Review",
      providerId: "cursor",
      acpSessionId: "provider-session-1",
      resumability: "resumable",
    }]);
  });

  it("round-trips all primary modes and falls back unknown modes to Edit", () => {
    const base = {
      rootPath: "/tmp/demo-project",
      name: "demo-project",
      openFilePaths: [],
      panes: { primary: { tabPaths: [] }, secondary: { tabPaths: [] } },
      secondaryOpen: false,
      expandedPaths: [],
      terminalKinds: ["shell" as const],
    };
    for (const mode of ["edit", "review", "agents", "lazygit"] as const) {
      const parsed = parseSessionSnapshot({ version: 1, projects: [{ ...base, mode }] })?.projects[0];
      expect(parsed?.mode).toBe(mode);
    }
    expect(parseSessionSnapshot({ version: 1, projects: [{ ...base, mode: "unknown" }] })?.projects[0].mode).toBe("edit");
    expect(parseAppMode("unknown")).toBe("edit");
  });

  it("sanitizes LazyGit mode without persisting forbidden session data", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-lazygit-mode-"));
    const filePath = path.join(dir, "sessions.json");
    const project = {
      ...emptyProjectSnapshot({ rootPath: "/tmp/demo-project", name: "demo-project" }),
      mode: "lazygit" as const,
      terminalKinds: ["lazygit" as const],
      token: "secret-token",
      ptyId: "pty-secret",
      scrollback: "output",
      command: "lazygit",
    } as unknown as ProjectSessionSnapshot;
    const sanitized = sanitizeSnapshot({ version: 1, projects: [project] });
    expect(sanitized.projects[0]?.mode).toBe("lazygit");
    await saveSessionSnapshot({ version: 1, projects: [project] }, filePath);
    const raw = await readFile(filePath, "utf8");
    for (const forbidden of ["secret-token", "pty-secret", "scrollback", "secret command"]) {
      expect(raw).not.toContain(forbidden);
    }
    expect(raw).toContain('"mode": "lazygit"');
    expect(await loadSessionSnapshot(filePath)).toEqual(sanitizeSnapshot({ version: 1, projects: [project] }));
  });
});

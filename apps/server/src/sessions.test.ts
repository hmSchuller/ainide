import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectSessionSnapshot } from "@ainide/shared";
import { emptyProjectSnapshot } from "./projects.js";
import { loadSessionSnapshot, parseSessionSnapshot, saveSessionSnapshot } from "./sessions.js";

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
});

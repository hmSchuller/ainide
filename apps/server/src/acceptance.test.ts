import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { missingTerminalKinds } from "@ainide/shared";
import { createServer, type AinideServer } from "./server.js";
import { saveSessionSnapshot } from "./sessions.js";

async function tempProject(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await writeFile(path.join(root, "readme.txt"), `${prefix}\n`);
  return root;
}

async function withServer(run: (server: AinideServer) => Promise<void>, sessionsPath?: string): Promise<void> {
  const filePath = sessionsPath ?? path.join(await mkdtemp(path.join(os.tmpdir(), "ainide-accept-")), "sessions.json");
  const previous = process.env.AINIDE_SESSIONS;
  process.env.AINIDE_SESSIONS = filePath;
  const server = await createServer();
  try {
    await run(server);
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.AINIDE_SESSIONS;
    else process.env.AINIDE_SESSIONS = previous;
  }
}

function auth(token: string) {
  return { "x-session-token": token, "content-type": "application/json" };
}

describe("acceptance matrix", () => {
  it("keeps two projects live, preserves PTYs across switch, and closes only one project's sessions", async () => {
    const first = await tempProject("ainide-acc-a-");
    const second = await tempProject("ainide-acc-b-");
    await withServer(async (server) => {
      const headers = auth(server.token);
      const a = await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: first } });
      expect(server.terminals.list(a.json().activeProjectId).filter((session) => session.kind === "agent")).toHaveLength(0);
      const agent = await server.app.inject({ method: "POST", url: "/api/terminals", headers, payload: { kind: "agent", cols: 80, rows: 24 } });
      const agentId = agent.json().id as string;
      const agentPid = agent.json().pid as number;
      await server.app.inject({ method: "POST", url: "/api/projects/open", headers, payload: { path: second } });
      expect(server.projects.openProjects()).toHaveLength(2);
      const listedOnB = await server.app.inject({ method: "GET", url: "/api/terminals", headers });
      expect(listedOnB.json().some((session: { id: string }) => session.id === agentId)).toBe(false);
      await server.app.inject({ method: "POST", url: "/api/projects/switch", headers, payload: { projectId: a.json().activeProjectId } });
      const listedOnA = await server.app.inject({ method: "GET", url: "/api/terminals", headers });
      const restored = listedOnA.json().find((session: { id: string }) => session.id === agentId);
      expect(restored.alive).toBe(true);
      expect(restored.pid).toBe(agentPid);
      expect(missingTerminalKinds(listedOnA.json(), ["agent"])).toEqual([]);
      await server.app.inject({ method: "DELETE", url: "/api/projects", headers, payload: { projectId: a.json().activeProjectId } });
      expect(server.terminals.list().some((session) => session.id === agentId)).toBe(false);
      expect(server.projects.openProjects()).toHaveLength(1);
    });
  });

  it("records last-active restore and a recoverable missing path", async () => {
    const root = await tempProject("ainide-acc-restore-");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-acc-snap-"));
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
      expect(server.terminals.list(server.projects.activeId).some((session) => session.kind === "shell" && session.alive)).toBe(true);
    }, sessionsPath);

    const missingSessions = path.join(dir, "missing.json");
    await saveSessionSnapshot({
      version: 1,
      activeRootPath: path.join(dir, "gone"),
      projects: [{
        rootPath: path.join(dir, "gone"),
        name: "gone",
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
      const session = await server.app.inject({ method: "GET", url: "/api/session" });
      expect(session.json().knownProjects.length).toBeGreaterThan(0);
    }, missingSessions);
  });
});

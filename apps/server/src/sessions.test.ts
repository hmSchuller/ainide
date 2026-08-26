import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyProjectSnapshot } from "./projects.js";
import { loadSessionSnapshot, saveSessionSnapshot } from "./sessions.js";

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
});

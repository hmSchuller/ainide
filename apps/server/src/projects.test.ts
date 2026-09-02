import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WorkspaceEvent } from "@ainide/shared";
import { afterEach, describe, expect, it } from "vitest";
import { UnsafePathError } from "./path-resolver.js";
import { ProjectRegistry } from "./projects.js";

async function tempProject(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await writeFile(path.join(root, "readme.txt"), `${prefix}\n`);
  return root;
}

describe("ProjectRegistry", () => {
  const registries: ProjectRegistry[] = [];
  afterEach(async () => {
    await Promise.all(registries.splice(0).map((registry) => registry.closeAll()));
  });

  function createRegistry(events: WorkspaceEvent[] = []): ProjectRegistry {
    const registry = new ProjectRegistry((event) => events.push(event));
    registries.push(registry);
    return registry;
  }

  it("opens the first project as active", async () => {
    const root = await tempProject("ainide-proj-first-");
    const registry = createRegistry();
    const { workspace, reused } = await registry.open(root);
    expect(reused).toBe(false);
    expect(workspace.rootPath).toBe(await import("node:fs/promises").then((fs) => fs.realpath(root)));
    expect(registry.activeId).toBe(workspace.rootPath);
    expect(registry.openProjects()).toHaveLength(1);
    expect(registry.activeManager?.watching).toBe(false);
  });

  it("opens a second project without dropping the first", async () => {
    const first = await tempProject("ainide-proj-a-");
    const second = await tempProject("ainide-proj-b-");
    const registry = createRegistry();
    const openedFirst = await registry.open(first);
    const openedSecond = await registry.open(second);
    expect(registry.openProjects()).toHaveLength(2);
    expect(registry.activeId).toBe(openedSecond.workspace.rootPath);
    expect(registry.managerFor(openedFirst.workspace.rootPath)?.watching).toBe(false);
    expect(registry.activeManager?.watching).toBe(false);
  });

  it("reuses an already-open path instead of creating a second live copy", async () => {
    const root = await tempProject("ainide-proj-dup-");
    const registry = createRegistry();
    const first = await registry.open(root);
    await registry.open(await tempProject("ainide-proj-other-"));
    const again = await registry.open(root);
    expect(again.reused).toBe(true);
    expect(again.workspace.rootPath).toBe(first.workspace.rootPath);
    expect(registry.openProjects()).toHaveLength(2);
    expect(registry.activeId).toBe(first.workspace.rootPath);
  });

  it("switches the active pointer without closing the other project", async () => {
    const first = await tempProject("ainide-proj-sw-a-");
    const second = await tempProject("ainide-proj-sw-b-");
    const registry = createRegistry();
    const a = await registry.open(first);
    const b = await registry.open(second);
    await registry.switchTo(a.workspace.rootPath);
    expect(registry.activeId).toBe(a.workspace.rootPath);
    expect(registry.openProjects().map((project) => project.projectId).sort()).toEqual(
      [a.workspace.rootPath, b.workspace.rootPath].sort(),
    );
  });

  it("closing the last project leaves no active workspace", async () => {
    const root = await tempProject("ainide-proj-last-");
    const registry = createRegistry();
    const opened = await registry.open(root);
    await registry.closeProject(opened.workspace.rootPath);
    expect(registry.activeId).toBeUndefined();
    expect(registry.currentWorkspace).toBeUndefined();
    expect(registry.openProjects()).toHaveLength(0);
    expect(registry.knownProjects()).toHaveLength(1);
  });

  it("does not emit hidden-project file events after a switch", async () => {
    const first = await tempProject("ainide-proj-hide-a-");
    const second = await tempProject("ainide-proj-hide-b-");
    const events: WorkspaceEvent[] = [];
    const registry = createRegistry(events);
    const a = await registry.open(first);
    await registry.open(second);
    const before = events.length;
    await writeFile(path.join(first, "secret.txt"), "hidden\n");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const leaked = events.slice(before).filter((event) => event.projectId === a.workspace.rootPath && event.type === "file_changed");
    expect(leaked).toEqual([]);
  });

  it("reloads git for the newly active root on activate", async () => {
    const first = await tempProject("ainide-proj-git-a-");
    const second = await tempProject("ainide-proj-git-b-");
    const events: WorkspaceEvent[] = [];
    const registry = createRegistry(events);
    const a = await registry.open(first);
    await registry.open(second);
    events.length = 0;
    await registry.switchTo(a.workspace.rootPath);
    expect(events.some((event) => event.type === "git_changed" && event.projectId === a.workspace.rootPath)).toBe(true);
  });

  it("resolves file reads through the active project only", async () => {
    const first = await tempProject("ainide-proj-read-a-");
    const second = await tempProject("ainide-proj-read-b-");
    await writeFile(path.join(first, "only-a.txt"), "from-a");
    const registry = createRegistry();
    await registry.open(first);
    await registry.open(second);
    await expect(registry.requireActive().read("only-a.txt")).rejects.toThrow();
    await expect(registry.requireActive().read("readme.txt")).resolves.toContain("ainide-proj-read-b-");
    await expect(registry.requireActive().read("../only-a.txt")).rejects.toBeInstanceOf(UnsafePathError);
  });
});

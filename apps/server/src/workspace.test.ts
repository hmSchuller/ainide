import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsafePathError } from "./path-resolver.js";
import { WorkspaceManager } from "./workspace.js";

describe("WorkspaceManager file mutations", () => {
  const managers: WorkspaceManager[] = [];

  afterEach(async () => {
    await Promise.all(managers.splice(0).map((manager) => manager.close()));
    vi.restoreAllMocks();
  });

  async function openWorkspace(): Promise<{ manager: WorkspaceManager; root: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-workspace-"));
    await writeFile(path.join(root, "readme.txt"), "hello\n");
    await mkdir(path.join(root, "src"), { recursive: true });
    const manager = new WorkspaceManager();
    managers.push(manager);
    await manager.open(root);
    return { manager, root };
  }

  it("creates files and directories", async () => {
    const { manager, root } = await openWorkspace();
    await manager.createFile("docs/notes.md");
    await manager.createDirectory("src/components/forms");
    expect(await readFile(path.join(root, "docs", "notes.md"), "utf8")).toBe("");
    const forms = path.join(root, "src", "components", "forms");
    const fs = await import("node:fs/promises");
    await expect(fs.stat(forms)).resolves.toBeDefined();
  });

  it("rejects creating an existing path", async () => {
    const { manager } = await openWorkspace();
    await expect(manager.createFile("readme.txt")).rejects.toThrow(/already exists/i);
  });

  it("renames files and rejects destination conflicts", async () => {
    const { manager, root } = await openWorkspace();
    await manager.rename("readme.txt", "notes.txt");
    expect(await readFile(path.join(root, "notes.txt"), "utf8")).toBe("hello\n");
    await expect(manager.rename("notes.txt", "src")).rejects.toThrow(/already exists/i);
  });

  it("deletes files and directories recursively", async () => {
    const { manager, root } = await openWorkspace();
    await manager.createDirectory("tmp/nested");
    await manager.createFile("tmp/nested/file.txt");
    await manager.delete("tmp");
    await expect(import("node:fs/promises").then((fs) => fs.stat(path.join(root, "tmp")))).rejects.toThrow();
  });

  it("rejects path traversal and symlink escapes", async () => {
    const { manager, root } = await openWorkspace();
    const outside = await mkdtemp(path.join(os.tmpdir(), "ainide-outside-"));
    await writeFile(path.join(outside, "secret.txt"), "secret");
    await symlink(outside, path.join(root, "link"));
    await expect(manager.delete("../outside")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(manager.rename("readme.txt", "link/secret.txt")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(manager.createFile("link/secret.txt")).rejects.toBeInstanceOf(UnsafePathError);
    const resolvedRoot = await realpath(root);
    expect(resolvedRoot).toBeTruthy();
  });

  it("does not open a recursive watcher", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-workspace-ignore-"));
    await writeFile(path.join(root, "readme.txt"), "hello\n");
    await writeFile(path.join(root, ".gitignore"), "generated/\n");
    await mkdir(path.join(root, "generated"));
    const manager = new WorkspaceManager();
    managers.push(manager);
    await manager.open(root);
    expect(manager.watching).toBe(false);
    await expect(manager.list("")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "readme.txt" }),
    ]));
  });

  it("filters bare and glob gitignore patterns from listings and recursive search", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-workspace-ignore-patterns-"));
    await writeFile(path.join(root, ".gitignore"), ".build\nDerivedData/\n*.generated\n");
    await writeFile(path.join(root, "visible.txt"), "visible");
    await writeFile(path.join(root, "ignored.generated"), "ignored");
    await mkdir(path.join(root, ".build"), { recursive: true });
    await writeFile(path.join(root, ".build", "artifact.txt"), "ignored");
    await mkdir(path.join(root, "DerivedData"), { recursive: true });
    await writeFile(path.join(root, "DerivedData", "artifact.txt"), "ignored");
    const manager = new WorkspaceManager();
    managers.push(manager);
    await manager.open(root);

    const listed = await manager.list("");
    expect(listed.map((entry) => entry.path)).toEqual([".gitignore", "visible.txt"]);
    expect((await manager.search("artifact")).map((entry) => entry.path)).toEqual([]);
    expect((await manager.search("generated")).map((entry) => entry.path)).toEqual([]);
  });

  it("opens a large workspace without enumerating its descendants", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-workspace-large-"));
    await Promise.all(Array.from({ length: 2_048 }, (_, index) => mkdir(path.join(root, `directory-${index}`))));
    const manager = new WorkspaceManager();
    managers.push(manager);

    await manager.open(root);

    expect(manager.current?.rootPath).toBe(await realpath(root));
    expect(manager.watching).toBe(false);
  });
});

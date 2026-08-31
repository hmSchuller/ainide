import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import chokidar, { type ChokidarOptions, type FSWatcher } from "chokidar";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceEvent } from "@ainide/shared";
import { WorkspaceManager } from "./workspace.js";
import { UnsafePathError } from "./path-resolver.js";

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

  it("does not watch gitignored directories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-workspace-ignore-"));
    await writeFile(path.join(root, "readme.txt"), "hello\n");
    await writeFile(path.join(root, ".gitignore"), "generated/\n");
    await mkdir(path.join(root, "generated"));
    const events: WorkspaceEvent[] = [];
    const manager = new WorkspaceManager();
    managers.push(manager);
    manager.onEvent((event) => events.push(event));
    await manager.open(root);
    events.length = 0;

    await writeFile(path.join(root, "generated", "output.txt"), "ignored\n");
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(events.filter((event) => event.type === "file_changed")).toEqual([]);
  });

  it("falls back to polling when the native watcher reaches its file limit", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-workspace-polling-"));
    await writeFile(path.join(root, "readme.txt"), "hello\n");
    const calls: ChokidarOptions[] = [];
    vi.spyOn(chokidar, "watch").mockImplementation(((watchPath, options) => {
      calls.push(options ?? {});
      const watcher = new EventEmitter() as unknown as FSWatcher & { close: () => Promise<void> };
      watcher.close = vi.fn(async () => undefined);
      if (!options?.usePolling) queueMicrotask(() => watcher.emit("error", Object.assign(new Error("too many files"), { code: "EMFILE" })));
      return watcher;
    }) as typeof chokidar.watch);
    const manager = new WorkspaceManager();
    managers.push(manager);

    await manager.open(root);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls.map((options) => options.usePolling)).toEqual([false, true]);
  });
});

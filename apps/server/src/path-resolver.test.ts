import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UnsafePathError, resolveSafePath } from "./path-resolver.js";

describe("resolveSafePath", () => {
  it("allows relative paths and rejects traversal or absolute paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-path-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "file.txt"), "ok");
    await expect(resolveSafePath(root, "src/file.txt")).resolves.toBe(path.join(root, "src", "file.txt"));
    await expect(resolveSafePath(root, "../outside")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(resolveSafePath(root, "../../../../etc/passwd")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(resolveSafePath(root, path.join(root, "src"))).rejects.toBeInstanceOf(UnsafePathError);
    await expect(resolveSafePath(root, "/absolute/path")).rejects.toBeInstanceOf(UnsafePathError);
  });

  it("rejects symlinks that leave the workspace", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "ainide-link-"));
    const root = path.join(parent, "root");
    const outside = path.join(parent, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(outside, "secret"), "no");
    await symlink(outside, path.join(root, "link"));
    await expect(resolveSafePath(root, "link/secret")).rejects.toBeInstanceOf(UnsafePathError);
  });
});

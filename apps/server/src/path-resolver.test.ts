import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expandTildePath, normalizeWorkspacePath, resolveSafePath, UnsafePathError } from "./path-resolver.js";

describe("normalizeWorkspacePath", () => {
  it("expands supported tilde paths and returns canonical directories", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ainide-home-"));
    const nested = path.join(home, "projects", "example");
    await mkdir(nested, { recursive: true });
    const platformPath = path.join("~", "projects", "example");

    expect(expandTildePath("~", home)).toBe(home);
    expect(expandTildePath(platformPath, home)).toBe(nested);
    const canonicalHome = await realpath(home);
    const canonicalNested = await realpath(nested);
    await expect(normalizeWorkspacePath("~", home)).resolves.toBe(canonicalHome);
    await expect(normalizeWorkspacePath(platformPath, home)).resolves.toBe(canonicalNested);
    await expect(normalizeWorkspacePath(nested)).resolves.toBe(canonicalNested);
    await expect(normalizeWorkspacePath(path.join(home, "projects", ".", "example"))).resolves.toBe(canonicalNested);
  });

  it("rejects unsupported tilde forms, relative paths, files, and missing paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-normalize-"));
    const file = path.join(root, "file.txt");
    await writeFile(file, "file");
    await expect(normalizeWorkspacePath("~other-user/project")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(normalizeWorkspacePath("relative/path")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(normalizeWorkspacePath(file)).rejects.toBeInstanceOf(UnsafePathError);
    await expect(normalizeWorkspacePath(path.join(root, "missing"))).rejects.toThrow();
  });
});

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

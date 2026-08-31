import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { relativeAcpPath, resolveAcpDirectory, resolveAcpPath } from "./paths.js";

describe("ACP paths", () => {
  it("accepts absolute paths in the fixed workspace and returns a safe path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-acp-paths-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "file.ts"), "export {};");

    await expect(relativeAcpPath(root, path.join(root, "src", "file.ts"))).resolves.toBe("src/file.ts");
    await expect(resolveAcpDirectory(root, path.join(root, "src"))).resolves.toBe(path.join(root, "src"));
  });

  it("rejects relative, traversal, cross-workspace, symlink, and invalid cwd paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-acp-paths-root-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "ainide-acp-paths-outside-"));
    await writeFile(path.join(outside, "secret.txt"), "secret");
    await symlink(outside, path.join(root, "linked"));
    await writeFile(path.join(root, "file.txt"), "file");

    await expect(resolveAcpPath(root, "file.txt")).rejects.toThrow("absolute");
    await expect(resolveAcpPath(root, path.join(root, "..", "secret.txt"))).rejects.toThrow("outside");
    await expect(resolveAcpPath(root, path.join(outside, "secret.txt"))).rejects.toThrow("outside");
    await expect(resolveAcpPath(root, path.join(root, "linked", "secret.txt"))).rejects.toThrow("Symlink");
    await expect(resolveAcpDirectory(root, path.join(root, "file.txt"))).rejects.toThrow("directory");
  });
});

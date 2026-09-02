import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bundledToolPath, resolveToolsDir, toolsPathPrefix, withToolsPath } from "./tools.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  delete process.env.AINIDE_TOOLS_DIR;
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ainide-tools-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe("resolveToolsDir", () => {
  it("defaults to ~/.ainide/tools when unset", () => {
    expect(resolveToolsDir()).toBe(path.join(os.homedir(), ".ainide", "tools"));
  });

  it("honors an AINIDE_TOOLS_DIR override", () => {
    process.env.AINIDE_TOOLS_DIR = "/some/other/tools";
    expect(resolveToolsDir()).toBe(path.resolve("/some/other/tools"));
  });

  it("is disabled when AINIDE_TOOLS_DIR is an empty string", () => {
    process.env.AINIDE_TOOLS_DIR = "";
    expect(resolveToolsDir()).toBeUndefined();
  });
});

describe("toolsPathPrefix", () => {
  it("returns the directory when it exists", () => {
    const dir = tempDir();
    process.env.AINIDE_TOOLS_DIR = dir;
    expect(toolsPathPrefix()).toBe(path.resolve(dir));
  });

  it("returns undefined when disabled", () => {
    process.env.AINIDE_TOOLS_DIR = "";
    expect(toolsPathPrefix()).toBeUndefined();
  });

  it("returns undefined when the directory does not exist", () => {
    process.env.AINIDE_TOOLS_DIR = path.join(tempDir(), "missing");
    expect(toolsPathPrefix()).toBeUndefined();
  });
});

describe("withToolsPath", () => {
  it("prepends the tools directory to PATH", () => {
    const dir = tempDir();
    process.env.AINIDE_TOOLS_DIR = dir;
    const result = withToolsPath({ PATH: "/usr/bin:/bin" });
    expect(result.PATH).toBe(`${path.resolve(dir)}:/usr/bin:/bin`);
  });

  it("restores the unmodified PATH when disabled with an empty string", () => {
    process.env.AINIDE_TOOLS_DIR = "";
    const input = { PATH: "/usr/local/bin:/usr/bin" };
    const result = withToolsPath(input);
    expect(result).toBe(input);
    expect(result.PATH).toBe("/usr/local/bin:/usr/bin");
  });

  it("restores the unmodified PATH when the directory is absent", () => {
    process.env.AINIDE_TOOLS_DIR = path.join(tempDir(), "missing");
    const input = { PATH: "/usr/bin" };
    const result = withToolsPath(input);
    expect(result).toBe(input);
    expect(result.PATH).toBe("/usr/bin");
  });

  it("handles an empty initial PATH", () => {
    const dir = tempDir();
    process.env.AINIDE_TOOLS_DIR = dir;
    const result = withToolsPath({ PATH: "" });
    expect(result.PATH).toBe(path.resolve(dir));
  });
});

describe("bundledToolPath", () => {
  it("reports the bundled tool path when the file exists", () => {
    const dir = tempDir();
    const tool = path.join(dir, "lazygit");
    writeFileSync(tool, "#!/bin/sh\nexit 0\n");
    chmodSync(tool, 0o755);
    process.env.AINIDE_TOOLS_DIR = dir;
    expect(bundledToolPath("lazygit")).toBe(tool);
  });

  it("reports undefined when the tool is not present", () => {
    const dir = tempDir();
    process.env.AINIDE_TOOLS_DIR = dir;
    expect(bundledToolPath("lazygit")).toBeUndefined();
  });

  it("reports undefined when disabled", () => {
    process.env.AINIDE_TOOLS_DIR = "";
    expect(bundledToolPath("lazygit")).toBeUndefined();
  });
});

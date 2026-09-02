import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLocalVersion } from "./version.js";

function git(dir: string, args: string[]): void {
  execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

async function freshRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-version-"));
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "tester@example.com"]);
  git(dir, ["config", "user.name", "Tester"]);
  await writeFile(path.join(dir, "file.txt"), "hello\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "init"]);
  return dir;
}

describe("resolveLocalVersion", () => {
  it("falls back to the package version when no tag exists", async () => {
    const dir = await freshRepo();
    await writeFile(path.join(dir, "package.json"), `${JSON.stringify({ name: "x", version: "1.2.3" }, null, 2)}\n`);
    expect(await resolveLocalVersion(dir)).toBe("1.2.3");
  });

  it("returns the newest tag when the head is tagged", async () => {
    const dir = await freshRepo();
    git(dir, ["tag", "v1.2.3"]);
    expect(await resolveLocalVersion(dir)).toBe("v1.2.3");
  });

  it("reports the distance past a tag in the git-describe form", async () => {
    const dir = await freshRepo();
    git(dir, ["tag", "v1.2.3"]);
    await writeFile(path.join(dir, "second.txt"), "more\n");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-q", "-m", "second"]);
    const version = await resolveLocalVersion(dir);
    expect(version.startsWith("v1.2.3-")).toBe(true);
  });

  it("falls back to 0.0.0 when there is neither a tag nor a package version", async () => {
    const dir = await freshRepo();
    expect(await resolveLocalVersion(dir)).toBe("0.0.0");
  });
});

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { getGitFileComparison, getGitStatus, parseGitPorcelain } from "./git.js";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
  return stdout;
}

async function initRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "Test"]);
  return root;
}

describe("parseGitPorcelain", () => {
  it("parses ordinary, untracked, renamed, and conflicted files", () => {
    const output = [" M src/app.ts", "A  added.ts", "?? scratch.txt", "R  new.ts", "old.ts", "UU conflict.ts", ""].join("\0");
    expect(parseGitPorcelain(output)).toEqual([
      { path: "src/app.ts", status: "modified" },
      { path: "added.ts", status: "added" },
      { path: "scratch.txt", status: "untracked" },
      { path: "new.ts", status: "renamed", previousPath: "old.ts" },
      { path: "conflict.ts", status: "conflicted" },
    ]);
  });

  it("also accepts the line-oriented porcelain form and preserves rename sources", () => {
    expect(parseGitPorcelain(" M src/app.ts\nR  old.ts -> new.ts\n?? scratch.txt\n")).toEqual([
      { path: "src/app.ts", status: "modified" },
      { path: "new.ts", status: "renamed", previousPath: "old.ts" },
      { path: "scratch.txt", status: "untracked" },
    ]);
  });
});

describe("getGitStatus HEAD identity", () => {
  it("reports the committed HEAD for an ordinary repository", async () => {
    const root = await initRepo("ainide-git-head-");
    await writeFile(path.join(root, "file.txt"), "one\n");
    await git(root, ["add", "file.txt"]);
    await git(root, ["commit", "-q", "-m", "initial"]);
    const status = await getGitStatus(root);
    expect(status.isRepository).toBe(true);
    expect(status.head).toMatch(/^[0-9a-f]{40}$/);
    expect(status.branch).toBeTruthy();
  });

  it("reports no HEAD for an unborn repository", async () => {
    const root = await initRepo("ainide-git-unborn-");
    const status = await getGitStatus(root);
    expect(status.isRepository).toBe(true);
    expect(status.head).toBeUndefined();
    expect(status.dirty).toBe(false);
  });

  it("reports the detached HEAD commit", async () => {
    const root = await initRepo("ainide-git-detached-");
    await writeFile(path.join(root, "file.txt"), "one\n");
    await git(root, ["add", "file.txt"]);
    await git(root, ["commit", "-q", "-m", "initial"]);
    const head = (await git(root, ["rev-parse", "HEAD"])).trim();
    await git(root, ["checkout", "-q", "--detach", head]);
    const status = await getGitStatus(root);
    expect(status.head).toBe(head);
  });
});

describe("getGitFileComparison", () => {
  it("returns the HEAD content for a tracked, modified file", async () => {
    const root = await initRepo("ainide-git-cmp-mod-");
    await writeFile(path.join(root, "file.txt"), "one\ntwo\n");
    await git(root, ["add", "file.txt"]);
    await git(root, ["commit", "-q", "-m", "initial"]);
    await writeFile(path.join(root, "file.txt"), "one\nTWO\n");
    const result = await getGitFileComparison(root, "file.txt");
    expect(result.status).toBe("modified");
    expect(result.baseline).toBe("head");
    expect(result.content).toBe("one\ntwo\n");
    expect(result.isRepository).toBe(true);
    expect(result.head).toMatch(/^[0-9a-f]{40}$/);
  });

  it("uses an empty baseline for an untracked file", async () => {
    const root = await initRepo("ainide-git-cmp-untracked-");
    await writeFile(path.join(root, "seed.txt"), "seed\n");
    await git(root, ["add", "seed.txt"]);
    await git(root, ["commit", "-q", "-m", "initial"]);
    await writeFile(path.join(root, "new.txt"), "hello\n");
    const result = await getGitFileComparison(root, "new.txt");
    expect(result.status).toBe("untracked");
    expect(result.baseline).toBe("empty");
    expect(result.content).toBe("");
  });

  it("does not classify an untracked binary as a text comparison", async () => {
    const root = await initRepo("ainide-git-cmp-untracked-bin-");
    await writeFile(path.join(root, "seed.txt"), "seed\n");
    await git(root, ["add", "seed.txt"]);
    await git(root, ["commit", "-q", "-m", "initial"]);
    await writeFile(path.join(root, "new.bin"), Buffer.from([0, 1, 2]));

    const result = await getGitFileComparison(root, "new.bin");
    expect(result.status).toBe("untracked");
    expect(result.baseline).toBe("unavailable");
    expect(result.unavailableReason).toBe("binary");
    expect(result.content).toBeUndefined();
  });

  it("returns the HEAD content for a deleted file", async () => {
    const root = await initRepo("ainide-git-cmp-del-");
    await writeFile(path.join(root, "file.txt"), "gone\n");
    await git(root, ["add", "file.txt"]);
    await git(root, ["commit", "-q", "-m", "initial"]);
    await rm(path.join(root, "file.txt"));
    const result = await getGitFileComparison(root, "file.txt");
    expect(result.status).toBe("deleted");
    expect(result.baseline).toBe("head");
    expect(result.content).toBe("gone\n");
  });

  it("uses the rename source path for the baseline", async () => {
    const root = await initRepo("ainide-git-cmp-rename-");
    await writeFile(path.join(root, "old.txt"), "moved\n");
    await git(root, ["add", "old.txt"]);
    await git(root, ["commit", "-q", "-m", "initial"]);
    await git(root, ["mv", "old.txt", "new.txt"]);
    const result = await getGitFileComparison(root, "new.txt");
    expect(result.status).toBe("renamed");
    expect(result.previousPath).toBe("old.txt");
    expect(result.baseline).toBe("head");
    expect(result.content).toBe("moved\n");
  });

  it("marks a binary baseline as unavailable", async () => {
    const root = await initRepo("ainide-git-cmp-bin-");
    await writeFile(path.join(root, "blob.bin"), Buffer.from([0, 1, 2, 0, 255]));
    await git(root, ["add", "blob.bin"]);
    await git(root, ["commit", "-q", "-m", "initial"]);
    const result = await getGitFileComparison(root, "blob.bin");
    expect(result.baseline).toBe("unavailable");
    expect(result.unavailableReason).toBe("binary");
  });

  it("reports non-repositories as unavailable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-git-cmp-norepo-"));
    await writeFile(path.join(root, "file.txt"), "x\n");
    const result = await getGitFileComparison(root, "file.txt");
    expect(result.isRepository).toBe(false);
    expect(result.baseline).toBe("unavailable");
    expect(result.unavailableReason).toBe("non-repository");
  });

  it("reports an unborn repository as unavailable", async () => {
    const root = await initRepo("ainide-git-cmp-unborn-");
    await writeFile(path.join(root, "file.txt"), "x\n");
    const result = await getGitFileComparison(root, "file.txt");
    expect(result.isRepository).toBe(true);
    expect(result.baseline).toBe("unavailable");
    expect(result.unavailableReason).toBe("no-head");
  });

  it("reports a conflicted file as unavailable", async () => {
    const root = await initRepo("ainide-git-cmp-conf-");
    await writeFile(path.join(root, "file.txt"), "base\n");
    await git(root, ["add", "file.txt"]);
    await git(root, ["commit", "-q", "-m", "initial"]);
    const mainBranch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    await git(root, ["checkout", "-q", "-b", "feature"]);
    await writeFile(path.join(root, "file.txt"), "feature\n");
    await git(root, ["commit", "-q", "-am", "feature"]);
    await git(root, ["checkout", "-q", mainBranch]);
    await writeFile(path.join(root, "file.txt"), "main\n");
    await git(root, ["commit", "-q", "-am", "main"]);
    await git(root, ["merge", "feature"]).catch(() => undefined);
    const result = await getGitFileComparison(root, "file.txt");
    expect(result.status).toBe("conflicted");
    expect(result.baseline).toBe("unavailable");
    expect(result.unavailableReason).toBe("conflict");
  });
});

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitFileStatus, GitFileStatusKind, GitStatus } from "@ainide/shared";

const execFileAsync = promisify(execFile);

function kindFor(code: string): GitFileStatusKind {
  if (code === "??") return "untracked";
  if (code.includes("U") || code === "AA" || code === "DD") return "conflicted";
  if (code.includes("R")) return "renamed";
  if (code.includes("A")) return "added";
  if (code.includes("D")) return "deleted";
  return "modified";
}

export function parseGitPorcelain(output: string): GitFileStatus[] {
  const nulSeparated = output.includes("\0");
  const fields = nulSeparated ? output.split("\0") : output.split(/\r?\n/);
  const result: GitFileStatus[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const code = field.slice(0, 2);
    const firstPath = field.slice(3);
    if (!firstPath) continue;
    const status = kindFor(code);
    if (status === "renamed" && nulSeparated && fields[index + 1]) {
      // With -z git emits the new path first and the old path second.
      index += 1;
    }
    const pathName = !nulSeparated && status === "renamed" ? (firstPath.split(" -> ").pop() || firstPath) : firstPath;
    result.push({ path: pathName, status });
  }
  return result;
}

export function parseNumstat(output: string): { insertions: number; deletions: number } {
  let insertions = 0;
  let deletions = 0;
  for (const line of output.split(/\r?\n/)) {
    const [added, removed] = line.split("\t");
    const add = Number(added);
    const del = Number(removed);
    if (Number.isFinite(add)) insertions += add;
    if (Number.isFinite(del)) deletions += del;
  }
  return { insertions, deletions };
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
  return stdout;
}

export async function getGitStatus(root: string): Promise<GitStatus> {
  try {
    await git(root, ["rev-parse", "--git-dir"]);
  } catch {
    return { dirty: false, isRepository: false, files: [], summary: { filesChanged: 0, insertions: 0, deletions: 0 } };
  }

  const [porcelain, branchResult, numstat] = await Promise.all([
    git(root, ["status", "--porcelain=v1", "-z"]),
    git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => git(root, ["rev-parse", "--short", "HEAD"])),
    git(root, ["diff", "--numstat", "HEAD"]).catch(() => git(root, ["diff", "--numstat"])),
  ]);
  const files = parseGitPorcelain(porcelain);
  const counts = parseNumstat(numstat);
  return {
    branch: branchResult.trim() || undefined,
    dirty: files.length > 0,
    isRepository: true,
    files,
    summary: { filesChanged: files.length, ...counts },
  };
}

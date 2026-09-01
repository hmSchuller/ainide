import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { GitFileComparison, GitFileStatus, GitFileStatusKind, GitStatus } from "@ainide/shared";

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
    let firstPath = field.slice(3);
    if (!firstPath) continue;
    const status = kindFor(code);
    let previousPath: string | undefined;
    if (status === "renamed") {
      if (nulSeparated && fields[index + 1]) {
        // With -z git emits the new path first and the old path second.
        previousPath = fields[index + 1];
        index += 1;
      } else if (!nulSeparated) {
        const parts = firstPath.split(" -> ");
        if (parts.length > 1) {
          previousPath = parts[0];
          firstPath = parts[parts.length - 1];
        }
      }
    }
    const entry: GitFileStatus = { path: firstPath, status };
    if (previousPath) entry.previousPath = previousPath;
    result.push(entry);
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

async function gitBuffer(root: string, args: string[]): Promise<Buffer> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  return stdout as Buffer;
}

async function workingTreeFileIsBinary(root: string, relativePath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.resolve(root, relativePath));
    if (raw.includes(0)) return true;
    new TextDecoder("utf-8", { fatal: true }).decode(raw);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    return true;
  }
}

export async function getGitStatus(root: string): Promise<GitStatus> {
  try {
    await git(root, ["rev-parse", "--git-dir"]);
  } catch {
    return { dirty: false, isRepository: false, files: [], summary: { filesChanged: 0, insertions: 0, deletions: 0 } };
  }

  const [porcelain, branchResult, numstat, headResult] = await Promise.all([
    git(root, ["status", "--porcelain=v1", "-z"]),
    git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => git(root, ["rev-parse", "--short", "HEAD"]).catch(() => "")),
    git(root, ["diff", "--numstat", "HEAD"]).catch(() => git(root, ["diff", "--numstat"])),
    git(root, ["rev-parse", "HEAD"]).catch(() => ""),
  ]);
  const files = parseGitPorcelain(porcelain);
  const counts = parseNumstat(numstat);
  return {
    branch: branchResult.trim() || undefined,
    head: headResult.trim() || undefined,
    dirty: files.length > 0,
    isRepository: true,
    files,
    summary: { filesChanged: files.length, ...counts },
  };
}

/**
 * Retrieve the committed `HEAD` baseline for a single workspace-relative file.
 * The path must already be validated by the caller; this performs fixed Git
 * operations only and never accepts an arbitrary revision or command.
 */
export async function getGitFileComparison(root: string, relativePath: string): Promise<GitFileComparison> {
  let isRepository = true;
  try {
    await git(root, ["rev-parse", "--git-dir"]);
  } catch {
    return { path: relativePath, status: "clean", baseline: "unavailable", unavailableReason: "non-repository", isRepository: false };
  }

  const [headResult, branchResult, porcelain] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]).catch(() => ""),
    git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => git(root, ["rev-parse", "--short", "HEAD"]).catch(() => "")),
    git(root, ["status", "--porcelain=v1", "-z"]),
  ]);
  const head = headResult.trim() || undefined;
  const branch = branchResult.trim() || undefined;
  const file = parseGitPorcelain(porcelain).find((entry) => entry.path === relativePath);
  const status: GitFileStatusKind | "clean" = file?.status ?? "clean";
  const previousPath = file?.previousPath;

  if (!head) {
    return { path: relativePath, status, previousPath, baseline: "unavailable", unavailableReason: "no-head", isRepository, branch };
  }
  if (status === "conflicted") {
    return { path: relativePath, status, previousPath, baseline: "unavailable", unavailableReason: "conflict", isRepository, head, branch };
  }
  if (status !== "deleted" && await workingTreeFileIsBinary(root, relativePath)) {
    return { path: relativePath, status, previousPath, baseline: "unavailable", unavailableReason: "binary", isRepository, head, branch };
  }
  if (status === "untracked") {
    return { path: relativePath, status, baseline: "empty", content: "", isRepository, head, branch };
  }

  const baselinePath = status === "renamed" && previousPath ? previousPath : relativePath;
  let raw: Buffer;
  try {
    raw = await gitBuffer(root, ["show", `HEAD:${baselinePath}`]);
  } catch {
    // No committed content at HEAD (e.g. a newly added file) uses an empty baseline.
    return { path: relativePath, status, previousPath, baseline: "empty", content: "", isRepository, head, branch };
  }
  if (raw.includes(0)) {
    return { path: relativePath, status, previousPath, baseline: "unavailable", unavailableReason: "binary", isRepository, head, branch };
  }
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return { path: relativePath, status, previousPath, baseline: "unavailable", unavailableReason: "binary", isRepository, head, branch };
  }
  return { path: relativePath, status, previousPath, baseline: "head", content, isRepository, head, branch };
}

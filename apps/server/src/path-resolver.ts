import { promises as fs, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export class UnsafePathError extends Error {
  constructor(message = "Path is outside the workspace") {
    super(message);
    this.name = "UnsafePathError";
  }
}

/** Expand supported home shorthand without invoking a shell. */
export function expandTildePath(input: string, home = os.homedir()): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new UnsafePathError("Workspace path must be a non-empty absolute path");
  }
  if (input === "~") return home;
  if (input.startsWith("~/") || input.startsWith(`~${path.sep}`)) return path.join(home, input.slice(2));
  if (input.startsWith("~")) throw new UnsafePathError("Only ~ and ~/ paths are supported");
  return input;
}

/** Resolve and validate an existing directory supplied as a workspace path. */
export async function normalizeWorkspacePath(input: string, home = os.homedir()): Promise<string> {
  const expanded = expandTildePath(input, home);
  if (!isAbsolute(expanded)) throw new UnsafePathError("Workspace path must be absolute");
  const candidate = path.resolve(expanded);
  const resolved = await fs.realpath(candidate);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new UnsafePathError("Workspace path must be an existing directory");
  return resolved;
}

function isAbsolute(input: string): boolean {
  return path.isAbsolute(input) || path.win32.isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input);
}

function partsFor(input: string): string[] {
  if (typeof input !== "string" || isAbsolute(input)) {
    throw new UnsafePathError("Only relative paths are allowed");
  }
  const normalized = input.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new UnsafePathError("Path traversal is not allowed");
  }
  return parts;
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function nearestExistingAncestor(candidate: string): string {
  let current = candidate;
  while (true) {
    try {
      realpathSync(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

/** Resolve a user-supplied workspace-relative path, including symlink checks. */
export async function resolveSafePath(root: string, input: string): Promise<string> {
  const parts = partsFor(input);
  const absoluteRoot = path.resolve(root);
  const realRoot = await fs.realpath(root);
  const candidate = path.resolve(absoluteRoot, ...parts);
  if (!inside(absoluteRoot, candidate)) throw new UnsafePathError();

  try {
    const realCandidate = await fs.realpath(candidate);
    if (!inside(realRoot, realCandidate)) throw new UnsafePathError("Symlink escapes are not allowed");
    return candidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const ancestor = await fs.realpath(nearestExistingAncestor(candidate));
    if (!inside(realRoot, ancestor)) throw new UnsafePathError("Symlink escapes are not allowed");
    return candidate;
  }
}

/** Synchronous counterpart, useful to callers that need validation during setup/tests. */
export function resolveSafePathSync(root: string, input: string): string {
  const parts = partsFor(input);
  const absoluteRoot = path.resolve(root);
  const realRoot = realpathSync(root);
  const candidate = path.resolve(absoluteRoot, ...parts);
  if (!inside(absoluteRoot, candidate)) throw new UnsafePathError();
  try {
    const realCandidate = realpathSync(candidate);
    if (!inside(realRoot, realCandidate)) throw new UnsafePathError("Symlink escapes are not allowed");
    return candidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const ancestor = realpathSync(nearestExistingAncestor(candidate));
    if (!inside(realRoot, ancestor)) throw new UnsafePathError("Symlink escapes are not allowed");
    return candidate;
  }
}

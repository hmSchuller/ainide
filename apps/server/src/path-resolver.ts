import { promises as fs, realpathSync } from "node:fs";
import path from "node:path";

export class UnsafePathError extends Error {
  constructor(message = "Path is outside the workspace") {
    super(message);
    this.name = "UnsafePathError";
  }
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

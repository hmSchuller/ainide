import { promises as fs, lstatSync, realpathSync } from "node:fs";
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

/** Resolve a user-supplied workspace-relative path, including symlink checks. */
export async function resolveSafePath(root: string, input: string): Promise<string> {
  const parts = partsFor(input);
  const absoluteRoot = path.resolve(root);
  const realRoot = await fs.realpath(root);
  const candidate = path.resolve(absoluteRoot, ...parts);
  if (!inside(absoluteRoot, candidate)) throw new UnsafePathError();
  await validatePathComponents(absoluteRoot, realRoot, parts);
  return candidate;
}

/** Synchronous counterpart, useful to callers that need validation during setup/tests. */
export function resolveSafePathSync(root: string, input: string): string {
  const parts = partsFor(input);
  const absoluteRoot = path.resolve(root);
  const realRoot = realpathSync(root);
  const candidate = path.resolve(absoluteRoot, ...parts);
  if (!inside(absoluteRoot, candidate)) throw new UnsafePathError();
  validatePathComponentsSync(absoluteRoot, realRoot, parts);
  return candidate;
}

/**
 * Validate each existing component, rather than only the nearest existing
 * ancestor. A dangling symlink can otherwise make a missing child appear safe
 * and later redirect a write outside the workspace.
 */
async function validatePathComponents(absoluteRoot: string, realRoot: string, parts: string[]): Promise<void> {
  let current = absoluteRoot;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const realCurrent = await fs.realpath(current);
      if (!inside(realRoot, realCurrent) && realCurrent !== realRoot) throw new UnsafePathError("Symlink escapes are not allowed");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) throw new UnsafePathError("Symlink escapes are not allowed");
      } catch (lstatError) {
        if ((lstatError as NodeJS.ErrnoException).code === "ENOENT") return;
        throw lstatError;
      }
      return;
    }
  }
}

function validatePathComponentsSync(absoluteRoot: string, realRoot: string, parts: string[]): void {
  let current = absoluteRoot;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const realCurrent = realpathSync(current);
      if (!inside(realRoot, realCurrent) && realCurrent !== realRoot) throw new UnsafePathError("Symlink escapes are not allowed");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        if (lstatSync(current).isSymbolicLink()) throw new UnsafePathError("Symlink escapes are not allowed");
      } catch (lstatError) {
        if ((lstatError as NodeJS.ErrnoException).code === "ENOENT") return;
        throw lstatError;
      }
      return;
    }
  }
}

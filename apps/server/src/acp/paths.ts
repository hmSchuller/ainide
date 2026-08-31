import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveSafePath, UnsafePathError } from "../path-resolver.js";

/** Convert an ACP absolute path into a workspace-relative path after validation. */
export async function resolveAcpPath(rootPath: string, value: unknown): Promise<string> {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new UnsafePathError("ACP paths must be absolute workspace paths");
  }
  const root = path.resolve(rootPath);
  const candidate = path.resolve(value);
  const relative = path.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new UnsafePathError("ACP path is outside the session workspace");
  }
  return resolveSafePath(root, relative);
}

export async function resolveAcpDirectory(rootPath: string, value: unknown): Promise<string> {
  if (value === undefined || value === null) return path.resolve(rootPath);
  const resolved = await resolveAcpPath(rootPath, value);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new UnsafePathError("ACP working directory must be a directory");
  return resolved;
}

export async function relativeAcpPath(rootPath: string, value: unknown): Promise<string> {
  const resolved = await resolveAcpPath(rootPath, value);
  return path.relative(path.resolve(rootPath), resolved).split(path.sep).join("/");
}

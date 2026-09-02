import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Resolves the repository root from this module's location. Both the compiled
 * layout (`apps/server/dist/`) and the development layout (`apps/server/src/`)
 * place this file exactly three levels below the repository root.
 */
export function repoRootDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

/**
 * Returns the local version: the newest git tag reachable from the install
 * directory via `git describe --tags`, falling back to the root package.json
 * version when the repository has no tags yet.
 */
export async function resolveLocalVersion(sourceDir: string = repoRootDir()): Promise<string> {
  const described = await describeTag(sourceDir);
  if (described) return described;
  return packageVersion(sourceDir);
}

async function describeTag(sourceDir: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["describe", "--tags"], { cwd: sourceDir, encoding: "utf8" });
    const tag = stdout.trim();
    return tag || undefined;
  } catch {
    return undefined;
  }
}

function packageVersion(sourceDir: string): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(sourceDir, "package.json"), "utf8"));
    const version = (parsed as { version?: unknown }).version;
    return typeof version === "string" && version.trim() ? version.trim() : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

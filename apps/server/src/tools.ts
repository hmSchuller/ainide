import { accessSync, constants, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolves the bundled-tools directory. `AINIDE_TOOLS_DIR` overrides the default
 * `~/.ainide/tools`; an empty value disables the bundled-tools directory.
 */
export function resolveToolsDir(): string | undefined {
  if ("AINIDE_TOOLS_DIR" in process.env) {
    const configured = process.env.AINIDE_TOOLS_DIR;
    if (!configured) return undefined;
    return path.resolve(configured);
  }
  return path.join(os.homedir(), ".ainide", "tools");
}

/**
 * Returns the absolute path of a bundled tool when it is present and executable
 * in the tools directory, so it can be launched directly and win over a
 * same-named user-installed tool regardless of how a login shell rebuilds PATH.
 * Returns undefined when the tools directory is disabled or the tool is absent.
 */
export function bundledToolPath(command: string): string | undefined {
  const dir = resolveToolsDir();
  if (!dir) return undefined;
  const candidate = path.join(dir, command);
  return isExecutable(candidate) ? candidate : undefined;
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the tools directory when it exists and should be prepended to PATH,
 * or undefined when the directory is disabled or absent.
 */
export function toolsPathPrefix(): string | undefined {
  const dir = resolveToolsDir();
  if (!dir) return undefined;
  return existsSync(dir) ? dir : undefined;
}

/**
 * Returns a copy of `env` with the bundled-tools directory prepended to PATH so
 * pinned tools win over same-named user-installed ones. When the tools directory
 * is disabled or absent, the input environment is returned unchanged.
 */
export function withToolsPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const dir = toolsPathPrefix();
  if (!dir) return env;
  const separator = process.platform === "win32" ? ";" : ":";
  const existing = env.PATH ?? env.Path ?? "";
  return { ...env, PATH: existing ? `${dir}${separator}${existing}` : dir };
}

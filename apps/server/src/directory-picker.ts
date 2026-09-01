import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WorkspaceDirectoryChild, WorkspaceDirectoryChildrenResponse } from "@ainide/shared";
import { normalizeWorkspacePath } from "./path-resolver.js";

/** List only immediate, directory-valued children of an existing path. */
export async function listDirectoryChildren(
  rawPath: string,
  query = "",
): Promise<WorkspaceDirectoryChildrenResponse> {
  const [currentPath, homePath] = await Promise.all([
    normalizeWorkspacePath(rawPath),
    normalizeWorkspacePath(os.homedir()),
  ]);
  const parentPath = await normalizeWorkspacePath(path.dirname(currentPath));
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const needle = query.toLocaleLowerCase();
  const children = (await Promise.all(entries
    .filter((entry) => !needle || entry.name.toLocaleLowerCase().includes(needle))
    .map(async (entry): Promise<WorkspaceDirectoryChild | undefined> => {
      const entryPath = path.join(currentPath, entry.name);
      try {
        const stat = await fs.stat(entryPath);
        if (!stat.isDirectory()) return undefined;
        return { name: entry.name, path: await fs.realpath(entryPath) };
      } catch {
        return undefined;
      }
    })))
    .filter((entry): entry is WorkspaceDirectoryChild => entry !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { currentPath, parentPath, homePath, children };
}

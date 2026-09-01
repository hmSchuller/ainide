import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FileEntry, GitFileComparison, GitStatus, RecentChange, Workspace, WorkspaceEvent } from "@ainide/shared";
import { getGitFileComparison, getGitStatus } from "./git.js";
import { normalizeWorkspacePath, resolveSafePath } from "./path-resolver.js";

const ignoredNames = new Set([".git", "node_modules", "dist", "build", ".next"]);

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  const prefix = pattern.includes("/") ? "" : "(?:.*\\/)?";
  return new RegExp(`^${prefix}${escaped}$`);
}

function ignoredByGitignore(patterns: RegExp[], relative: string, name: string): boolean {
  return patterns.some((pattern) => pattern.test(relative) || pattern.test(name));
}

export class WorkspaceManager {
  private workspace?: Workspace;
  private patterns: RegExp[] = [];
  private recent: RecentChange[] = [];
  private gitStatus?: GitStatus;
  private gitStatusGeneration = 0;
  private gitStatusRequest?: { generation: number; promise: Promise<GitStatus> };
  private eventHandler: (event: WorkspaceEvent) => void = () => undefined;

  onEvent(handler: (event: WorkspaceEvent) => void): void {
    this.eventHandler = handler;
  }

  get current(): Workspace | undefined {
    return this.workspace;
  }

  get watching(): boolean {
    return false;
  }

  async validate(rawPath: string): Promise<string> {
    return normalizeWorkspacePath(rawPath);
  }

  async open(rawPath: string): Promise<Workspace> {
    const resolved = await this.validate(rawPath);
    this.workspace = { rootPath: resolved, name: path.basename(resolved) || resolved };
    this.recent = [];
    this.invalidateGitStatus();
    this.patterns = await this.readIgnorePatterns(resolved);
    this.emit({ type: "workspace_changed", projectId: resolved });
    await this.refreshGit();
    return this.workspace;
  }

  async pause(): Promise<void> {
    // Project processes remain alive while an inactive project is paused.
  }

  async activate(): Promise<void> {
    const root = this.requireRoot();
    this.emit({ type: "workspace_changed", projectId: root.rootPath });
    await this.refreshGit();
  }

  async close(): Promise<void> {
    this.workspace = undefined;
    this.invalidateGitStatus();
  }

  private emit(event: WorkspaceEvent): void {
    this.eventHandler(event);
  }

  private async readIgnorePatterns(root: string): Promise<RegExp[]> {
    try {
      const text = await fs.readFile(path.join(root, ".gitignore"), "utf8");
      return text.split(/\r?\n/).flatMap((line) => {
        const clean = line.trim();
        if (!clean || clean.startsWith("#") || clean.startsWith("!")) return [];
        const pattern = clean.replace(/^\//, "").replace(/\/$/, "");
        return [globToRegExp(pattern)];
      });
    } catch {
      return [];
    }
  }

  async refreshGit(emit = true): Promise<GitStatus | undefined> {
    if (!this.workspace) return undefined;
    const rootPath = this.workspace.rootPath;
    for (;;) {
      const generation = this.gitStatusGeneration;
      const status = await this.readGitStatus(true, rootPath);
      if (!this.workspace || this.workspace.rootPath !== rootPath) return undefined;
      if (generation !== this.gitStatusGeneration) continue;
      if (emit) this.emit({ type: "git_changed", projectId: rootPath, status });
      return status;
    }
  }

  async list(relativePath: string): Promise<FileEntry[]> {
    const root = this.requireRoot();
    const directory = await resolveSafePath(root.rootPath, relativePath);
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) throw new Error("Requested path is not a directory");
    const gitStatus = this.gitStatus ?? await this.readGitStatus(false, root.rootPath);
    const statusMap = new Map(gitStatus.files.map((file) => [file.path, file.status]));
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => {
      const rel = path.relative(root.rootPath, path.join(directory, entry.name)).split(path.sep).join("/");
      return !ignoredNames.has(entry.name) && !ignoredByGitignore(this.patterns, rel, entry.name);
    }).map((entry) => {
      const entryPath = path.relative(root.rootPath, path.join(directory, entry.name)).split(path.sep).join("/");
      const recent = this.recent.some((change) => change.path === entryPath);
      const directStatus = statusMap.get(entryPath);
      const descendantStatus = directStatus ?? [...statusMap.entries()].find(([filePath]) => filePath.startsWith(`${entryPath}/`))?.[1];
      return { name: entry.name, path: entryPath, type: entry.isDirectory() ? "directory" as const : "file" as const, ...(descendantStatus ? { gitStatus: descendantStatus } : {}), ...(recent ? { recent: true } : {}) };
    }).sort((a, b) => Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name));
  }

  async search(query: string): Promise<FileEntry[]> {
    const root = this.requireRoot();
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const matches: FileEntry[] = [];
    const visit = async (directory: string): Promise<void> => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (ignoredNames.has(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        const relative = path.relative(root.rootPath, absolute).split(path.sep).join("/");
        if (ignoredByGitignore(this.patterns, relative, entry.name)) continue;
        if (entry.isDirectory()) {
          await visit(absolute);
          continue;
        }
        if (relative.toLowerCase().includes(needle)) {
          matches.push({ name: entry.name, path: relative, type: "file", recent: this.recent.some((change) => change.path === relative) });
          if (matches.length >= 200) return;
        }
      }
    };
    await visit(root.rootPath);
    return matches;
  }

  async read(relativePath: string): Promise<string | { type: "binary"; path: string }> {
    const root = this.requireRoot();
    const filePath = await resolveSafePath(root.rootPath, relativePath);
    const content = await fs.readFile(filePath);
    if (content.includes(0)) return { type: "binary", path: relativePath };
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(content);
    } catch {
      return { type: "binary", path: relativePath };
    }
  }

  async compare(relativePath: string): Promise<GitFileComparison> {
    const root = this.requireRoot();
    // Validate the workspace-relative path (rejecting traversal, absolute paths, and
    // symlink escapes) before any Git or filesystem comparison operation.
    await resolveSafePath(root.rootPath, relativePath);
    return getGitFileComparison(root.rootPath, relativePath.replaceAll("\\", "/"));
  }

  async write(relativePath: string, content: string): Promise<void> {
    const root = this.requireRoot();
    if (!relativePath || typeof content !== "string") throw new Error("A relative path and string content are required");
    const filePath = await resolveSafePath(root.rootPath, relativePath);
    const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.ainide-${randomUUID()}.tmp`);
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, filePath);
    this.invalidateGitStatus();
  }

  async delete(relativePath: string): Promise<void> {
    const root = this.requireRoot();
    if (!relativePath) throw new Error("A relative path is required");
    const target = await resolveSafePath(root.rootPath, relativePath);
    await fs.rm(target, { recursive: true, force: true });
    this.invalidateGitStatus();
  }

  async rename(from: string, to: string): Promise<void> {
    const root = this.requireRoot();
    if (!from || !to) throw new Error("from and to paths are required");
    const source = await resolveSafePath(root.rootPath, from);
    const destination = await resolveSafePath(root.rootPath, to);
    try {
      await fs.access(destination);
      throw new Error("Destination path already exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(source, destination);
    this.invalidateGitStatus();
  }

  async createFile(relativePath: string): Promise<void> {
    const root = this.requireRoot();
    if (!relativePath) throw new Error("A relative path is required");
    const filePath = await resolveSafePath(root.rootPath, relativePath);
    try {
      await fs.access(filePath);
      throw new Error("Path already exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "", "utf8");
    this.invalidateGitStatus();
  }

  async createDirectory(relativePath: string): Promise<void> {
    const root = this.requireRoot();
    if (!relativePath) throw new Error("A relative path is required");
    const dirPath = await resolveSafePath(root.rootPath, relativePath);
    try {
      await fs.access(dirPath);
      throw new Error("Path already exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fs.mkdir(dirPath, { recursive: true });
  }

  recentFor(relativePath: string): RecentChange[] {
    return this.recent.filter((change) => change.path === relativePath || change.path.startsWith(`${relativePath}/`));
  }

  private requireRoot(): Workspace {
    if (!this.workspace) throw new Error("Open a workspace first");
    return this.workspace;
  }

  private invalidateGitStatus(): void {
    this.gitStatus = undefined;
    this.gitStatusGeneration += 1;
  }

  private async readGitStatus(force: boolean, rootPath: string): Promise<GitStatus> {
    if (!force && this.gitStatus) return this.gitStatus;
    const generation = this.gitStatusGeneration;
    if (this.gitStatusRequest?.generation === generation) return this.gitStatusRequest.promise;
    const promise = getGitStatus(rootPath).then((status) => {
      if (this.workspace?.rootPath === rootPath && this.gitStatusGeneration === generation) this.gitStatus = status;
      return status;
    }).finally(() => {
      if (this.gitStatusRequest?.promise === promise) this.gitStatusRequest = undefined;
    });
    this.gitStatusRequest = { generation, promise };
    return promise;
  }
}

import chokidar, { type FSWatcher } from "chokidar";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FileEntry, GitStatus, RecentChange, Workspace, WorkspaceEvent } from "@ainide/shared";
import { getGitStatus } from "./git.js";
import { resolveSafePath } from "./path-resolver.js";

const ignoredNames = new Set([".git", "node_modules", "dist", "build", ".next"]);

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function ignoredByGitignore(patterns: RegExp[], relative: string, name: string): boolean {
  return patterns.some((pattern) => pattern.test(relative) || pattern.test(name));
}

export class WorkspaceManager {
  private workspace?: Workspace;
  private watcher?: FSWatcher;
  private patterns: RegExp[] = [];
  private recent: RecentChange[] = [];
  private gitTimer?: NodeJS.Timeout;
  private usePolling = false;
  private eventHandler: (event: WorkspaceEvent) => void = () => undefined;

  onEvent(handler: (event: WorkspaceEvent) => void): void {
    this.eventHandler = handler;
  }

  get current(): Workspace | undefined {
    return this.workspace;
  }

  get watching(): boolean {
    return Boolean(this.watcher);
  }

  async validate(rawPath: string): Promise<string> {
    const resolved = await fs.realpath(path.resolve(rawPath));
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) throw new Error("Workspace path must be an existing directory");
    return resolved;
  }

  async open(rawPath: string): Promise<Workspace> {
    const resolved = await this.validate(rawPath);
    await this.closeWatcher();
    this.workspace = { rootPath: resolved, name: path.basename(resolved) || resolved };
    this.recent = [];
    this.patterns = await this.readIgnorePatterns(resolved);
    await this.startWatcher();
    this.emit({ type: "workspace_changed", projectId: resolved });
    await this.refreshGit();
    return this.workspace;
  }

  async pause(): Promise<void> {
    if (this.gitTimer) clearTimeout(this.gitTimer);
    this.gitTimer = undefined;
    await this.closeWatcher();
  }

  async activate(): Promise<void> {
    const root = this.requireRoot();
    if (!this.watcher) await this.startWatcher();
    this.emit({ type: "workspace_changed", projectId: root.rootPath });
    await this.refreshGit();
  }

  async close(): Promise<void> {
    if (this.gitTimer) clearTimeout(this.gitTimer);
    this.gitTimer = undefined;
    await this.closeWatcher();
    this.workspace = undefined;
  }

  private async startWatcher(): Promise<void> {
    const root = this.requireRoot();
    await this.closeWatcher();
    const watcher = chokidar.watch(root.rootPath, {
      ignoreInitial: true,
      followSymlinks: false,
      usePolling: this.usePolling,
      interval: 250,
      ignored: (entry) => {
        const base = path.basename(entry);
        if (ignoredNames.has(base)) return true;
        const relative = path.relative(root.rootPath, entry).split(path.sep).join("/");
        return Boolean(relative && ignoredByGitignore(this.patterns, relative, base));
      },
    });
    this.watcher = watcher;
    watcher.on("error", (error) => {
      if (isWatcherLimitError(error)) void this.fallbackToPolling(watcher, root.rootPath);
    });
    for (const event of ["add", "change", "unlink", "addDir", "unlinkDir"] as const) {
      watcher.on(event, (changedPath) => this.recordChange(event, changedPath));
    }
  }

  private async fallbackToPolling(failedWatcher: FSWatcher, rootPath: string): Promise<void> {
    if (this.watcher !== failedWatcher || this.usePolling) return;
    this.usePolling = true;
    this.watcher = undefined;
    try { await failedWatcher.close(); } catch { /* The watcher may already be unusable. */ }
    if (!this.workspace || this.workspace.rootPath !== rootPath) return;
    await this.startWatcher();
  }

  private async closeWatcher(): Promise<void> {
    if (!this.watcher) return;
    const watcher = this.watcher;
    this.watcher = undefined;
    await watcher.close();
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
        return [globToRegExp(pattern.includes("/") ? pattern : `(?:.*\\/)?${pattern}`)];
      });
    } catch {
      return [];
    }
  }

  private recordChange(event: string, changedPath: string): void {
    if (!this.workspace) return;
    const relative = path.relative(this.workspace.rootPath, changedPath).split(path.sep).join("/");
    if (!relative || relative.startsWith("..") || ignoredNames.has(path.basename(relative))) return;
    const type: RecentChange["type"] = event === "add" || event === "addDir" ? "created" : event === "unlink" || event === "unlinkDir" ? "deleted" : "changed";
    this.recent = [{ path: relative, type, timestamp: Date.now() }, ...this.recent.filter((item) => item.path !== relative)].slice(0, 200);
    const projectId = this.workspace.rootPath;
    this.emit({ type: "file_changed", projectId, path: relative, change: type });
    this.emit({ type: "workspace_changed", projectId });
    if (this.gitTimer) clearTimeout(this.gitTimer);
    this.gitTimer = setTimeout(() => void this.refreshGit(), 150);
  }

  async refreshGit(): Promise<GitStatus | undefined> {
    if (!this.workspace) return undefined;
    const status = await getGitStatus(this.workspace.rootPath);
    this.emit({ type: "git_changed", projectId: this.workspace.rootPath, status });
    return status;
  }

  async list(relativePath: string): Promise<FileEntry[]> {
    const root = this.requireRoot();
    const directory = await resolveSafePath(root.rootPath, relativePath);
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) throw new Error("Requested path is not a directory");
    const gitStatus = await getGitStatus(root.rootPath);
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

  async write(relativePath: string, content: string): Promise<void> {
    const root = this.requireRoot();
    if (!relativePath || typeof content !== "string") throw new Error("A relative path and string content are required");
    const filePath = await resolveSafePath(root.rootPath, relativePath);
    const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.ainide-${randomUUID()}.tmp`);
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, filePath);
  }

  async delete(relativePath: string): Promise<void> {
    const root = this.requireRoot();
    if (!relativePath) throw new Error("A relative path is required");
    const target = await resolveSafePath(root.rootPath, relativePath);
    await fs.rm(target, { recursive: true, force: true });
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
}

function isWatcherLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "EMFILE" || code === "ENOSPC";
}

import path from "node:path";
import type { ProjectRef, ProjectSessionSnapshot, SessionSnapshot, Workspace, WorkspaceEvent } from "@ainide/shared";
import { WorkspaceManager } from "./workspace.js";

export type LiveProject = {
  projectId: string;
  manager: WorkspaceManager;
};

export function emptyProjectSnapshot(workspace: Workspace): ProjectSessionSnapshot {
  return {
    rootPath: workspace.rootPath,
    name: workspace.name,
    openFilePaths: [],
    panes: { primary: { tabPaths: [] }, secondary: { tabPaths: [] } },
    secondaryOpen: false,
    expandedPaths: [],
    mode: "edit",
    terminalKinds: [],
  };
}

export function projectRefFrom(snapshot: ProjectSessionSnapshot): ProjectRef {
  return { projectId: snapshot.rootPath, rootPath: snapshot.rootPath, name: snapshot.name };
}

export class ProjectRegistry {
  private readonly live = new Map<string, LiveProject>();
  private readonly known = new Map<string, ProjectSessionSnapshot>();
  private activeProjectId?: string;

  constructor(private readonly onEvent: (event: WorkspaceEvent) => void = () => undefined) {}

  get activeId(): string | undefined {
    return this.activeProjectId;
  }

  get active(): LiveProject | undefined {
    return this.activeProjectId ? this.live.get(this.activeProjectId) : undefined;
  }

  get activeManager(): WorkspaceManager | undefined {
    return this.active?.manager;
  }

  get currentWorkspace(): Workspace | undefined {
    return this.activeManager?.current;
  }

  managerFor(projectId: string): WorkspaceManager | undefined {
    return this.live.get(projectId)?.manager;
  }

  isKnownOrOpen(rootPath: string): boolean {
    return this.known.has(rootPath) || this.live.has(rootPath);
  }

  openProjects(): ProjectRef[] {
    return [...this.live.values()].flatMap((project) => {
      const workspace = project.manager.current;
      return workspace ? [{ projectId: project.projectId, rootPath: workspace.rootPath, name: workspace.name }] : [];
    });
  }

  knownProjects(): ProjectRef[] {
    return [...this.known.values()].map(projectRefFrom);
  }

  snapshotFor(projectId: string): ProjectSessionSnapshot | undefined {
    return this.known.get(projectId);
  }

  requireActive(): WorkspaceManager {
    const manager = this.activeManager;
    if (!manager?.current) throw new Error("Open a workspace first");
    return manager;
  }

  applyDiskSnapshot(snapshot: SessionSnapshot): void {
    for (const project of snapshot.projects) {
      this.known.set(project.rootPath, project);
    }
  }

  toSnapshot(): SessionSnapshot {
    return {
      version: 1,
      ...(this.activeProjectId ? { activeRootPath: this.activeProjectId } : {}),
      projects: [...this.known.values()],
    };
  }

  updateUiSnapshot(projectId: string, patch: Partial<ProjectSessionSnapshot>): ProjectSessionSnapshot | undefined {
    const current = this.known.get(projectId);
    if (!current) return undefined;
    const next = { ...current, ...patch, rootPath: current.rootPath, name: patch.name ?? current.name };
    this.known.set(projectId, next);
    return next;
  }

  async open(rawPath: string): Promise<{ workspace: Workspace; reused: boolean }> {
    const probe = new WorkspaceManager();
    const resolved = await probe.validate(rawPath);
    this.migrateKnownPath(rawPath, resolved);
    const existing = this.live.get(resolved);
    if (existing) {
      if (this.activeProjectId !== resolved) await this.activate(resolved);
      const workspace = existing.manager.current;
      if (!workspace) throw new Error("Open a workspace first");
      this.upsertKnown(workspace);
      return { workspace, reused: true };
    }
    const previousId = this.activeProjectId;
    if (previousId) await this.live.get(previousId)?.manager.pause();
    const manager = new WorkspaceManager();
    manager.onEvent(this.onEvent);
    try {
      const workspace = await manager.open(resolved);
      this.live.set(workspace.rootPath, { projectId: workspace.rootPath, manager });
      this.activeProjectId = workspace.rootPath;
      this.upsertKnown(workspace);
      return { workspace, reused: false };
    } catch (error) {
      await manager.close();
      if (previousId && this.live.has(previousId)) await this.live.get(previousId)?.manager.activate();
      throw error;
    }
  }

  async switchTo(projectId: string): Promise<Workspace> {
    const live = this.live.get(projectId);
    if (live) {
      if (this.activeProjectId !== projectId) await this.activate(projectId);
      const workspace = live.manager.current;
      if (!workspace) throw new Error("Open a workspace first");
      return workspace;
    }
    const known = this.known.get(projectId);
    if (!known) throw new Error("Project is not open");
    return (await this.open(known.rootPath)).workspace;
  }

  async closeProject(projectId: string): Promise<Workspace | undefined> {
    const live = this.live.get(projectId);
    if (!live) throw new Error("Project is not open");
    await live.manager.close();
    this.live.delete(projectId);
    if (this.activeProjectId === projectId) {
      const nextId = this.live.keys().next().value as string | undefined;
      this.activeProjectId = nextId;
      if (nextId) await this.live.get(nextId)?.manager.activate();
    }
    return this.currentWorkspace;
  }

  async closeAll(): Promise<void> {
    const ids = [...this.live.keys()];
    this.activeProjectId = undefined;
    await Promise.all(ids.map(async (id) => {
      const live = this.live.get(id);
      this.live.delete(id);
      await live?.manager.close();
    }));
  }

  private async activate(projectId: string): Promise<void> {
    const next = this.live.get(projectId);
    if (!next) throw new Error("Project is not open");
    const previousId = this.activeProjectId;
    if (previousId && previousId !== projectId) await this.live.get(previousId)?.manager.pause();
    this.activeProjectId = projectId;
    await next.manager.activate();
  }

  private migrateKnownPath(rawPath: string, resolved: string): void {
    if (rawPath === resolved) return;
    const fromRaw = this.known.get(rawPath);
    if (!fromRaw || this.known.has(resolved)) {
      if (fromRaw && rawPath !== resolved) this.known.delete(rawPath);
      return;
    }
    this.known.delete(rawPath);
    this.known.set(resolved, { ...fromRaw, rootPath: resolved, name: fromRaw.name || path.basename(resolved) });
  }

  private upsertKnown(workspace: Workspace): void {
    const existing = this.known.get(workspace.rootPath);
    if (existing) {
      this.known.set(workspace.rootPath, { ...existing, name: workspace.name, rootPath: workspace.rootPath });
      return;
    }
    this.known.set(workspace.rootPath, emptyProjectSnapshot(workspace));
  }
}

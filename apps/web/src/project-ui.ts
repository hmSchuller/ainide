import type { AcpActivity, AcpSession, GitStatus, ProjectRef, ProjectSessionSnapshot, RecentChange, TerminalSession, Workspace, WorkspaceEvent } from "@ainide/shared";
import type { AppMode, DirectoryState, EditorPaneId, EditorPaneState, EditorTab, ReviewState } from "./types";
import type { ReferenceItem } from "./references";

export interface ProjectUiBag {
  mode: AppMode;
  directories: Record<string, DirectoryState>;
  expanded: Record<string, boolean>;
  selectedPath?: string;
  tabs: EditorTab[];
  panes: Record<EditorPaneId, EditorPaneState>;
  secondaryOpen: boolean;
  focusedPaneId: EditorPaneId;
  git?: GitStatus;
  terminals: TerminalSession[];
  acpSessions: AcpSession[];
  acpHistory: Record<string, AcpActivity[]>;
  acpDrafts: Record<string, AcpPromptDraft>;
  activeTerminalId?: string;
  referenceKit: ReferenceItem[];
  focusedSessionId?: string;
  pinnedSessionId?: string;
  toolSessionId?: string;
  referenceTargetId?: string;
  recentChanges: Record<string, number>;
  review: ReviewState;
}

export interface AcpPromptDraft {
  text: string;
  references: ReferenceItem[];
}

export interface ProjectUiFields extends ProjectUiBag {
  workspace?: Workspace;
  activeProjectId?: string;
}

export function emptyPanes(): Record<EditorPaneId, EditorPaneState> {
  return { primary: { tabPaths: [] }, secondary: { tabPaths: [] } };
}

export function emptyProjectBag(): ProjectUiBag {
  return {
    mode: "edit",
    directories: {},
    expanded: {},
    tabs: [],
    panes: emptyPanes(),
    secondaryOpen: false,
    focusedPaneId: "primary",
    terminals: [],
    acpSessions: [],
    acpHistory: {},
    acpDrafts: {},
    referenceKit: [],
    recentChanges: {},
    review: { loading: false, scope: "working-tree" },
  };
}

export function captureProjectBag(state: ProjectUiBag): ProjectUiBag {
  return {
    mode: state.mode,
    directories: state.directories,
    expanded: state.expanded,
    selectedPath: state.selectedPath,
    tabs: state.tabs.map((tab) => ({ ...tab })),
    panes: {
      primary: { ...state.panes.primary, tabPaths: [...state.panes.primary.tabPaths] },
      secondary: { ...state.panes.secondary, tabPaths: [...state.panes.secondary.tabPaths] },
    },
    secondaryOpen: state.secondaryOpen,
    focusedPaneId: state.focusedPaneId,
    git: state.git,
    terminals: [...state.terminals],
    acpSessions: state.acpSessions.map((session) => ({
      ...session,
      capabilities: { ...session.capabilities },
      authMethods: session.authMethods.map((method) => ({ ...method })),
      configOptions: session.configOptions.map((option) => ({ ...option, ...(option.choices ? { choices: option.choices.map((choice) => ({ ...choice })) } : {}) })),
      pendingRequests: [...session.pendingRequests],
    })),
    acpHistory: Object.fromEntries(Object.entries(state.acpHistory).map(([id, history]) => [id, history.map((activity) => ({ ...activity }))])),
    acpDrafts: Object.fromEntries(Object.entries(state.acpDrafts).map(([id, draft]) => [id, { text: draft.text, references: draft.references.map((reference) => ({ ...reference })) }])),
    activeTerminalId: state.activeTerminalId,
    referenceKit: [...state.referenceKit],
    focusedSessionId: state.focusedSessionId,
    pinnedSessionId: state.pinnedSessionId,
    toolSessionId: state.toolSessionId,
    referenceTargetId: state.referenceTargetId,
    recentChanges: { ...state.recentChanges },
    review: { ...state.review },
  };
}

export function eventBelongsToActiveProject(event: WorkspaceEvent, activeProjectId?: string): boolean {
  return Boolean(activeProjectId) && event.projectId === activeProjectId;
}

export function normalizeGitStatus(status: GitStatus): GitStatus {
  return {
    branch: status.branch,
    dirty: status.dirty,
    isRepository: status.isRepository,
    files: [...status.files].sort((left, right) => left.path.localeCompare(right.path) || left.status.localeCompare(right.status)),
    summary: { ...status.summary },
  };
}

export function gitStatusEqual(left: GitStatus | undefined, right: GitStatus | undefined): boolean {
  if (!left || !right) return false;
  return JSON.stringify(normalizeGitStatus(left)) === JSON.stringify(normalizeGitStatus(right));
}

export function gitStatusPaths(previous: GitStatus | undefined, current: GitStatus): string[] {
  return [...new Set([...(previous?.files ?? []), ...current.files].map((file) => file.path))].sort();
}

export function explorerPathsForGitChanges(expanded: Record<string, boolean>, changedPaths: string[]): string[] {
  const paths = new Set<string>([""]);
  for (const [directory, open] of Object.entries(expanded)) {
    if (!open) continue;
    if (changedPaths.some((changedPath) => directory === "" || changedPath === directory || changedPath.startsWith(`${directory}/`))) paths.add(directory);
  }
  return [...paths];
}

export function gitChangeType(previous: GitStatus | undefined, current: GitStatus, path: string): RecentChange["type"] {
  const previousFile = previous?.files.find((file) => file.path === path);
  const currentFile = current.files.find((file) => file.path === path);
  if (currentFile?.status === "deleted" || (!currentFile && (previousFile?.status === "added" || previousFile?.status === "untracked"))) return "deleted";
  if (!previousFile && (currentFile?.status === "added" || currentFile?.status === "untracked")) return "created";
  return "changed";
}

export function applyDiskToTabs(
  tabs: EditorTab[],
  disk: Record<string, { content?: string; binary?: boolean; error?: string }>,
): EditorTab[] {
  return tabs.map((tab) => {
    const file = disk[tab.path];
    if (!file) return tab;
    if (file.error) return { ...tab, error: file.error };
    if (file.binary) return { ...tab, binary: true };
    const content = file.content ?? "";
    if (tab.content !== tab.savedContent) return { ...tab, conflict: { externalContent: content }, error: undefined };
    return { ...tab, content, savedContent: content, conflict: undefined, error: undefined };
  });
}

export function snapshotFromBag(workspace: Workspace, bag: ProjectUiBag): ProjectSessionSnapshot {
  const acpSessions = bag.acpSessions.flatMap((session) => session.acpSessionId ? [{
    id: session.id,
    title: session.title,
    titleSource: session.titleSource,
    providerId: session.providerId,
    acpSessionId: session.acpSessionId,
    resumability: session.resumability === "resumable" || session.resumability === "restored" ? "resumable" as const : "non_resumable" as const,
  }] : []);
  return {
    rootPath: workspace.rootPath,
    name: workspace.name,
    openFilePaths: bag.tabs.map((tab) => tab.path),
    panes: {
      primary: { tabPaths: [...bag.panes.primary.tabPaths], ...(bag.panes.primary.activePath ? { activePath: bag.panes.primary.activePath } : {}) },
      secondary: { tabPaths: [...bag.panes.secondary.tabPaths], ...(bag.panes.secondary.activePath ? { activePath: bag.panes.secondary.activePath } : {}) },
    },
    secondaryOpen: bag.secondaryOpen,
    expandedPaths: Object.entries(bag.expanded).flatMap(([path, open]) => open ? [path] : []),
    mode: bag.mode,
    terminalKinds: [...new Set(bag.terminals.filter((terminal) => terminal.alive && terminal.kind !== "agent").map((terminal) => terminal.kind))],
    agentSessions: bag.terminals.filter((terminal) => terminal.kind === "agent").map((terminal) => ({ title: terminal.title })),
    ...(acpSessions.length ? { acpSessions } : {}),
  };
}

export function knownProjectSeed(knownProjects: ProjectRef[], lastWorkspace: string | null): string {
  if (knownProjects.length > 0) return knownProjects[0]?.rootPath ?? "";
  return lastWorkspace ?? "";
}

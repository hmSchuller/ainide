import type { GitStatus, ProjectRef, ProjectSessionSnapshot, TerminalSession, Workspace, WorkspaceEvent } from "@ainide/shared";
import type { AppMode, DirectoryState, EditorPaneId, EditorPaneState, EditorTab, ReviewState } from "./types";

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
  activeTerminalId?: string;
  recentChanges: Record<string, number>;
  review: ReviewState;
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
    activeTerminalId: state.activeTerminalId,
    recentChanges: { ...state.recentChanges },
    review: { ...state.review },
  };
}

export function eventBelongsToActiveProject(event: WorkspaceEvent, activeProjectId?: string): boolean {
  return Boolean(activeProjectId) && event.projectId === activeProjectId;
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
    terminalKinds: [...new Set(bag.terminals.filter((terminal) => terminal.alive).map((terminal) => terminal.kind))],
  };
}

export function knownProjectSeed(knownProjects: ProjectRef[], lastWorkspace: string | null): string {
  if (knownProjects.length > 0) return knownProjects[0]?.rootPath ?? "";
  return lastWorkspace ?? "";
}

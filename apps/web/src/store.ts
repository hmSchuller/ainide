import { create } from "zustand";
import type { FileEntry, GitStatus, ProjectRef, TerminalSession, Workspace } from "@ainide/shared";
import type { AppMode, DirectoryState, EditorPaneId, EditorPaneState, EditorTab, Notice, ReviewState } from "./types";
import type { ReferenceItem } from "./references";
import { captureProjectBag, emptyPanes, emptyProjectBag, type ProjectUiBag } from "./project-ui";
import { persistTerminalCollapsed, readTerminalCollapsedPreference } from "./layout-prefs";

interface AppState {
  token: string;
  workspace?: Workspace;
  activeProjectId?: string;
  openProjects: ProjectRef[];
  knownProjects: ProjectRef[];
  projectBags: Record<string, ProjectUiBag>;
  restoreError?: string;
  mode: AppMode;
  directories: Record<string, DirectoryState>;
  expanded: Record<string, boolean>;
  explorerWidth: number;
  terminalHeight: number;
  selectedPath?: string;
  tabs: EditorTab[];
  panes: Record<EditorPaneId, EditorPaneState>;
  secondaryOpen: boolean;
  focusedPaneId: EditorPaneId;
  git?: GitStatus;
  terminals: TerminalSession[];
  activeTerminalId?: string;
  referenceKit: ReferenceItem[];
  focusedSessionId?: string;
  pinnedSessionId?: string;
  toolSessionId?: string;
  referenceTargetId?: string;
  terminalCollapsed: boolean;
  terminalMaximized: boolean;
  notices: Notice[];
  review: ReviewState;
  recentChanges: Record<string, number>;
  terminalError?: string;
  pendingLocation?: { path: string; line: number; column?: number; paneId: EditorPaneId };
  setToken: (token: string) => void;
  setWorkspace: (workspace?: Workspace) => void;
  setDirectory: (path: string, state: DirectoryState) => void;
  toggleDirectory: (path: string) => void;
  setSelected: (path?: string) => void;
  addTab: (paneId: EditorPaneId, tab: EditorTab) => void;
  updateTab: (path: string, update: Partial<EditorTab>) => void;
  closeTab: (paneId: EditorPaneId, path: string) => void;
  setActivePath: (paneId: EditorPaneId, path?: string) => void;
  setFocusedPane: (paneId: EditorPaneId) => void;
  moveTab: (sourcePaneId: EditorPaneId, destinationPaneId: EditorPaneId, path: string, destinationIndex?: number) => void;
  openSecondary: () => void;
  closeSecondary: () => void;
  setGit: (git?: GitStatus) => void;
  setTerminals: (terminals: TerminalSession[]) => void;
  addTerminal: (terminal: TerminalSession) => void;
  updateTerminal: (id: string, update: Partial<TerminalSession>) => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  addReference: (reference: ReferenceItem) => void;
  removeReference: (id: string) => void;
  clearReferences: () => void;
  setFocusedSession: (id?: string) => void;
  setPinnedSession: (id?: string) => void;
  setToolSession: (id?: string) => void;
  setReferenceTarget: (id?: string) => void;
  setReview: (review: Partial<ReviewState>) => void;
  markRecent: (path: string) => void;
  setNotice: (text: string, tone?: Notice["tone"]) => void;
  dismissNotice: (id: number) => void;
  setMode: (mode: AppMode) => void;
  setTerminalCollapsed: (collapsed: boolean) => void;
  setTerminalMaximized: (maximized: boolean) => void;
  setTerminalError: (error?: string) => void;
  setPendingLocation: (location?: AppState["pendingLocation"]) => void;
  setProjectSession: (input: { activeProjectId?: string; openProjects: ProjectRef[]; knownProjects: ProjectRef[]; restoreError?: string }) => void;
  stashActiveBag: () => void;
  restoreProjectBag: (projectId: string, workspace: Workspace, fallback?: ProjectUiBag) => void;
  applyDiskTabs: (tabs: EditorTab[]) => void;
  clearActiveProject: () => void;
  removeProjectBag: (projectId: string) => void;
  renameTabPath: (from: string, to: string) => void;
}

const savedNumber = (key: string, fallback: number): number => {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export function findPaneForPath(panes: Record<EditorPaneId, EditorPaneState>, path: string): EditorPaneId | undefined {
  return (Object.keys(panes) as EditorPaneId[]).find((paneId) => panes[paneId].tabPaths.includes(path));
}

function paneWith(panes: Record<EditorPaneId, EditorPaneState>, paneId: EditorPaneId, update: Partial<EditorPaneState>): Record<EditorPaneId, EditorPaneState> {
  return { ...panes, [paneId]: { ...panes[paneId], ...update } };
}

export const useAppStore = create<AppState>((set) => ({
  token: "",
  openProjects: [],
  knownProjects: [],
  projectBags: {},
  mode: "edit",
  directories: {},
  expanded: {},
  explorerWidth: savedNumber("ainide:explorer-width", 248),
  terminalHeight: savedNumber("ainide:terminal-height", 260),
  tabs: [],
  panes: emptyPanes(),
  secondaryOpen: false,
  focusedPaneId: "primary",
  terminals: [],
  referenceKit: [],
  terminalCollapsed: readTerminalCollapsedPreference(),
  terminalMaximized: false,
  notices: [],
  review: { loading: false, scope: "working-tree" },
  recentChanges: {},
  setToken: (token) => set({ token }),
  setWorkspace: (workspace) => set({ workspace, directories: {}, expanded: {}, selectedPath: undefined }),
  setDirectory: (path, state) => set((current) => ({ directories: { ...current.directories, [path]: state } })),
  toggleDirectory: (path) => set((current) => ({ expanded: { ...current.expanded, [path]: !current.expanded[path] } })),
  setSelected: (selectedPath) => set({ selectedPath }),
  addTab: (paneId, tab) => set((current) => {
    const owner = findPaneForPath(current.panes, tab.path);
    if (owner) return { focusedPaneId: owner, panes: paneWith(current.panes, owner, { activePath: tab.path }) };
    const nextTabs = current.tabs.some((item) => item.path === tab.path) ? current.tabs : [...current.tabs, tab];
    const nextPanes = paneWith(current.panes, paneId, { tabPaths: [...current.panes[paneId].tabPaths, tab.path], activePath: tab.path });
    return { tabs: nextTabs, panes: nextPanes, focusedPaneId: paneId, secondaryOpen: paneId === "secondary" ? true : current.secondaryOpen };
  }),
  updateTab: (path, update) => set((current) => ({ tabs: current.tabs.map((tab) => (tab.path === path ? { ...tab, ...update } : tab)) })),
  closeTab: (paneId, path) => set((current) => {
    const pane = current.panes[paneId];
    const index = pane.tabPaths.indexOf(path);
    if (index < 0) return current;
    const tabPaths = pane.tabPaths.filter((item) => item !== path);
    const activePath = pane.activePath === path ? tabPaths[Math.max(0, index - 1)] : pane.activePath;
    const nextPanes = paneWith(current.panes, paneId, { tabPaths, activePath });
    return { panes: nextPanes, tabs: findPaneForPath(nextPanes, path) ? current.tabs : current.tabs.filter((tab) => tab.path !== path) };
  }),
  setActivePath: (paneId, activePath) => set((current) => ({ panes: paneWith(current.panes, paneId, { activePath }), focusedPaneId: paneId })),
  setFocusedPane: (focusedPaneId) => set({ focusedPaneId }),
  moveTab: (sourcePaneId, destinationPaneId, path, destinationIndex) => set((current) => {
    const source = current.panes[sourcePaneId];
    const sourceIndex = source.tabPaths.indexOf(path);
    if (sourceIndex < 0) return current;
    if (sourcePaneId === destinationPaneId) {
      const tabPaths = source.tabPaths.filter((item) => item !== path);
      const requestedIndex = destinationIndex ?? tabPaths.length;
      const index = Math.max(0, Math.min(sourceIndex < requestedIndex ? requestedIndex - 1 : requestedIndex, tabPaths.length));
      tabPaths.splice(index, 0, path);
      return { panes: paneWith(current.panes, sourcePaneId, { tabPaths }), focusedPaneId: sourcePaneId };
    }
    const destination = current.panes[destinationPaneId];
    const sourcePaths = source.tabPaths.filter((item) => item !== path);
    const destinationPaths = destination.tabPaths.filter((item) => item !== path);
    const index = Math.max(0, Math.min(destinationIndex ?? destinationPaths.length, destinationPaths.length));
    destinationPaths.splice(index, 0, path);
    return {
      panes: { ...current.panes, [sourcePaneId]: { ...source, tabPaths: sourcePaths, activePath: source.activePath === path ? sourcePaths[Math.max(0, sourceIndex - 1)] : source.activePath }, [destinationPaneId]: { ...destination, tabPaths: destinationPaths, activePath: path } },
      focusedPaneId: destinationPaneId,
      secondaryOpen: destinationPaneId === "secondary" ? true : current.secondaryOpen,
    };
  }),
  openSecondary: () => set({ secondaryOpen: true }),
  closeSecondary: () => set((current) => {
    const primary = current.panes.primary;
    const secondary = current.panes.secondary;
    const tabPaths = [...primary.tabPaths, ...secondary.tabPaths.filter((path) => !primary.tabPaths.includes(path))];
    return { panes: { primary: { tabPaths, activePath: primary.activePath ?? secondary.activePath }, secondary: { tabPaths: [], activePath: undefined } }, secondaryOpen: false, focusedPaneId: "primary" };
  }),
  setGit: (git) => set({ git }),
  setTerminals: (terminals) => set((current) => {
    const ids = new Set(terminals.map((terminal) => terminal.id));
    const agents = terminals.filter((terminal) => terminal.kind === "agent");
    const tools = terminals.filter((terminal) => terminal.kind !== "agent");
    return {
      terminals,
      activeTerminalId: current.activeTerminalId && ids.has(current.activeTerminalId) ? current.activeTerminalId : terminals[0]?.id,
      focusedSessionId: current.focusedSessionId && ids.has(current.focusedSessionId) ? current.focusedSessionId : agents[0]?.id,
      pinnedSessionId: current.pinnedSessionId && ids.has(current.pinnedSessionId) ? current.pinnedSessionId : undefined,
      toolSessionId: current.toolSessionId && ids.has(current.toolSessionId) ? current.toolSessionId : tools[0]?.id,
      referenceTargetId: current.referenceTargetId && terminals.some((terminal) => terminal.id === current.referenceTargetId && terminal.kind === "agent" && terminal.alive) ? current.referenceTargetId : undefined,
    };
  }),
  addTerminal: (terminal) => set((current) => ({ terminals: [...current.terminals, terminal], activeTerminalId: terminal.id })),
  updateTerminal: (id, update) => set((current) => ({ terminals: current.terminals.map((terminal) => terminal.id === id ? { ...terminal, ...update } : terminal) })),
  removeTerminal: (id) => set((current) => ({ terminals: current.terminals.filter((item) => item.id !== id), activeTerminalId: current.activeTerminalId === id ? current.terminals.find((item) => item.id !== id)?.id : current.activeTerminalId })),
  setActiveTerminal: (activeTerminalId) => set({ activeTerminalId }),
  addReference: (reference) => set((current) => ({ referenceKit: [...current.referenceKit, reference] })),
  removeReference: (id) => set((current) => ({ referenceKit: current.referenceKit.filter((reference) => reference.id !== id) })),
  clearReferences: () => set({ referenceKit: [] }),
  setFocusedSession: (focusedSessionId) => set({ focusedSessionId }),
  setPinnedSession: (pinnedSessionId) => set({ pinnedSessionId }),
  setToolSession: (toolSessionId) => set({ toolSessionId }),
  setReferenceTarget: (referenceTargetId) => set({ referenceTargetId }),
  setReview: (review) => set((current) => ({ review: { ...current.review, ...review } })),
  markRecent: (path) => set((current) => ({ recentChanges: { ...current.recentChanges, [path]: Date.now() } })),
  setNotice: (text, tone = "info") => set((current) => ({ notices: [...current.notices, { id: Date.now() + Math.random(), text, tone }] })),
  dismissNotice: (id) => set((current) => ({ notices: current.notices.filter((notice) => notice.id !== id) })),
  setMode: (mode) => set({ mode }),
  setTerminalCollapsed: (terminalCollapsed) => {
    persistTerminalCollapsed(terminalCollapsed);
    set({ terminalCollapsed });
  },
  setTerminalMaximized: (terminalMaximized) => {
    persistTerminalCollapsed(false);
    set({ terminalMaximized, terminalCollapsed: false });
  },
  setTerminalError: (terminalError) => set({ terminalError }),
  setPendingLocation: (pendingLocation) => set({ pendingLocation }),
  setProjectSession: (input) => set({
    activeProjectId: input.activeProjectId,
    openProjects: input.openProjects,
    knownProjects: input.knownProjects,
    restoreError: input.restoreError,
  }),
  stashActiveBag: () => set((current) => {
    if (!current.activeProjectId) return current;
    return { projectBags: { ...current.projectBags, [current.activeProjectId]: captureProjectBag(current) } };
  }),
  restoreProjectBag: (projectId, workspace, fallback) => set((current) => {
    const bag = current.projectBags[projectId] ?? fallback ?? emptyProjectBag();
    return {
      workspace,
      activeProjectId: projectId,
      mode: bag.mode,
      directories: bag.directories,
      expanded: bag.expanded,
      selectedPath: bag.selectedPath,
      tabs: bag.tabs,
      panes: bag.panes,
      secondaryOpen: bag.secondaryOpen,
      focusedPaneId: bag.focusedPaneId,
      git: bag.git,
      terminals: bag.terminals,
      activeTerminalId: bag.activeTerminalId,
      referenceKit: bag.referenceKit,
      focusedSessionId: bag.focusedSessionId,
      pinnedSessionId: bag.pinnedSessionId,
      toolSessionId: bag.toolSessionId,
      referenceTargetId: bag.referenceTargetId,
      recentChanges: bag.recentChanges,
      review: { ...bag.review, url: undefined, message: undefined, loading: false },
    };
  }),
  applyDiskTabs: (tabs) => set({ tabs }),
  clearActiveProject: () => set({
    workspace: undefined,
    activeProjectId: undefined,
    ...emptyProjectBag(),
  }),
  removeProjectBag: (projectId) => set((current) => {
    const projectBags = { ...current.projectBags };
    delete projectBags[projectId];
    return { projectBags };
  }),
  renameTabPath: (from, to) => set((current) => {
    const name = to.split(/[\\/]/).filter(Boolean).pop() ?? to;
    const tabs = current.tabs.map((tab) => (tab.path === from ? { ...tab, path: to, name } : tab));
    const panes = (Object.keys(current.panes) as EditorPaneId[]).reduce<Record<EditorPaneId, EditorPaneState>>((next, paneId) => {
      const pane = current.panes[paneId];
      next[paneId] = {
        tabPaths: pane.tabPaths.map((path) => (path === from ? to : path)),
        activePath: pane.activePath === from ? to : pane.activePath,
      };
      return next;
    }, emptyPanes());
    return { tabs, panes };
  }),
}));

export function persistLayout(explorerWidth?: number, terminalHeight?: number): void {
  if (explorerWidth) localStorage.setItem("ainide:explorer-width", String(explorerWidth));
  if (terminalHeight) localStorage.setItem("ainide:terminal-height", String(terminalHeight));
}

export function isDirty(tab: EditorTab): boolean {
  return tab.content !== tab.savedContent;
}

export function findEntry(entries: FileEntry[] | undefined, path: string): FileEntry | undefined {
  return entries?.find((entry) => entry.path === path);
}

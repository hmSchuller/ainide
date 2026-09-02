import type { AcpActivity, AcpServerEvent, AcpSession, BuildCommand, FileEntry, GitFileComparison, GitStatus, ProjectRef, TerminalSession, VersionInfo, Workspace } from "@ainide/shared";
import { create } from "zustand";
import { type AcpClientState, applyAcpServerEvent } from "./acp-state";
import { persistBuildSelection, readBuildSelections } from "./build-selections";
import { language } from "./file-language";
import { persistTerminalCollapsed, readTerminalCollapsedPreference } from "./layout-prefs";
import { type AcpPromptDraft, captureProjectBag, emptyPanes, emptyProjectBag, type ProjectUiBag } from "./project-ui";
import type { ReferenceItem } from "./references";
import type { AppMode, DirectoryState, EditorPaneId, EditorPaneState, EditorTab, GitComparisonRequest, GitComparisonRequestInput, GitComparisonState, Notice, ReviewState } from "./types";

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
  gitComparisons: Record<string, GitComparisonState>;
  terminals: TerminalSession[];
  acpSessions: AcpSession[];
  acpHistory: Record<string, AcpActivity[]>;
  acpDrafts: Record<string, AcpPromptDraft>;
  acpSequences: Record<string, number>;
  acpQueued: AcpClientState["queued"];
  activeTerminalId?: string;
  referenceKit: ReferenceItem[];
  focusedSessionId?: string;
  pinnedSessionId?: string;
  toolSessionId?: string;
  referenceTargetId?: string;
  terminalCollapsed: boolean;
  terminalMaximized: boolean;
  buildCommands: BuildCommand[];
  buildSelections: Record<string, string>;
  notices: Notice[];
  review: ReviewState;
  recentChanges: Record<string, number>;
  version?: VersionInfo;
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
  beginGitComparison: (input: GitComparisonRequestInput) => number | undefined;
  setGitComparisonResult: (input: GitComparisonRequest & { comparison: GitFileComparison }) => void;
  setGitComparisonError: (input: GitComparisonRequest & { message: string }) => void;
  invalidateGitComparison: (projectId: string, path: string) => void;
  invalidateGitComparisons: (projectId?: string, head?: string) => void;
  setTerminals: (terminals: TerminalSession[]) => void;
  setAcpSessions: (sessions: AcpSession[]) => void;
  addAcpSession: (session: AcpSession) => void;
  updateAcpSession: (id: string, update: Partial<AcpSession>) => void;
  applyAcpEvent: (event: AcpServerEvent) => void;
  setAcpDraft: (id: string, draft: AcpPromptDraft) => void;
  updateAcpDraft: (id: string, update: Partial<AcpPromptDraft>) => void;
  clearAcpDraft: (id: string) => void;
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
  setBuildCommands: (commands: BuildCommand[]) => void;
  setBuildSelection: (projectId: string, label: string) => void;
  setTerminalError: (error?: string) => void;
  setVersion: (version?: VersionInfo) => void;
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

let nextGitComparisonRequestId = 0;

export function gitComparisonKey(projectId: string, path: string, head?: string): string {
  return JSON.stringify([projectId, path, head]);
}

function isCurrentGitComparisonRequest(state: AppState, request: GitComparisonRequestInput): boolean {
  return state.token === request.token && state.activeProjectId === request.projectId;
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
  gitComparisons: {},
  terminals: [],
  acpSessions: [],
  acpHistory: {},
  acpDrafts: {},
  acpSequences: {},
  acpQueued: {},
  referenceKit: [],
  terminalCollapsed: readTerminalCollapsedPreference(),
  terminalMaximized: false,
  buildCommands: [],
  buildSelections: readBuildSelections(),
  notices: [],
  review: { loading: false, scope: "working-tree" },
  recentChanges: {},
  setToken: (token) => set((current) => current.token === token ? { token } : { token, gitComparisons: {} }),
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
  beginGitComparison: (input) => {
    const requestId = ++nextGitComparisonRequestId;
    let accepted = false;
    set((current) => {
      if (!isCurrentGitComparisonRequest(current, input)) return current;
      accepted = true;
      const key = gitComparisonKey(input.projectId, input.path, input.head);
      return {
        gitComparisons: {
          ...current.gitComparisons,
          [key]: { status: "loading", projectId: input.projectId, path: input.path, ...(input.head !== undefined ? { head: input.head } : {}), requestId },
        },
      };
    });
    return accepted ? requestId : undefined;
  },
  setGitComparisonResult: (input) => set((current) => {
    if (!isCurrentGitComparisonRequest(current, input)) return current;
    const key = gitComparisonKey(input.projectId, input.path, input.head);
    const pending = current.gitComparisons[key];
    if (!pending || pending.status !== "loading" || pending.requestId !== input.requestId) return current;
    if (input.comparison.head !== input.head) {
      const gitComparisons = { ...current.gitComparisons };
      delete gitComparisons[key];
      return { gitComparisons };
    }
    const base = { projectId: input.projectId, path: input.path, ...(input.head !== undefined ? { head: input.head } : {}) };
    const next: GitComparisonState = input.comparison.baseline === "unavailable"
      ? { ...base, status: "unavailable", comparable: false, reason: input.comparison.unavailableReason ?? "unknown", comparison: input.comparison }
      : { ...base, status: "ready", comparable: true, comparison: input.comparison };
    return { gitComparisons: { ...current.gitComparisons, [key]: next } };
  }),
  setGitComparisonError: (input) => set((current) => {
    if (!isCurrentGitComparisonRequest(current, input)) return current;
    const key = gitComparisonKey(input.projectId, input.path, input.head);
    const pending = current.gitComparisons[key];
    if (!pending || pending.status !== "loading" || pending.requestId !== input.requestId) return current;
    return {
      gitComparisons: {
        ...current.gitComparisons,
        [key]: { status: "error", projectId: input.projectId, path: input.path, ...(input.head !== undefined ? { head: input.head } : {}), message: input.message },
      },
    };
  }),
  invalidateGitComparison: (projectId, path) => set((current) => ({
    gitComparisons: Object.fromEntries(Object.entries(current.gitComparisons).filter(([, comparison]) => comparison.projectId !== projectId || comparison.path !== path)),
  })),
  invalidateGitComparisons: (projectId, head) => set((current) => {
    const gitComparisons = Object.fromEntries(Object.entries(current.gitComparisons).filter(([, comparison]) => {
      if (projectId !== undefined && comparison.projectId !== projectId) return true;
      if (projectId !== undefined && head !== undefined) return comparison.head === head;
      return false;
    }));
    return { gitComparisons };
  }),
  setTerminals: (terminals) => set((current) => {
    const ids = new Set(terminals.map((terminal) => terminal.id));
    const agents = terminals.filter((terminal) => terminal.kind === "agent");
    const tools = terminals.filter((terminal) => terminal.kind !== "agent");
    const agentIds = new Set([...agents.map((agent) => agent.id), ...current.acpSessions.map((session) => session.id)]);
    const liveAgentIds = new Set([...agents.filter((agent) => agent.alive).map((agent) => agent.id), ...current.acpSessions.filter((session) => session.status === "live" || session.status === "waiting").map((session) => session.id)]);
    return {
      terminals,
      activeTerminalId: current.activeTerminalId && ids.has(current.activeTerminalId) ? current.activeTerminalId : terminals[0]?.id,
      focusedSessionId: current.focusedSessionId && agentIds.has(current.focusedSessionId) ? current.focusedSessionId : agents[0]?.id ?? current.acpSessions[0]?.id,
      pinnedSessionId: current.pinnedSessionId && agentIds.has(current.pinnedSessionId) ? current.pinnedSessionId : undefined,
      toolSessionId: current.toolSessionId && ids.has(current.toolSessionId) ? current.toolSessionId : tools[0]?.id,
      referenceTargetId: current.referenceTargetId && liveAgentIds.has(current.referenceTargetId) ? current.referenceTargetId : undefined,
    };
  }),
  setAcpSessions: (acpSessions) => set((current) => {
    const scopedSessions = current.activeProjectId ? acpSessions.filter((session) => session.projectId === current.activeProjectId) : acpSessions;
    const ptyAgents = current.terminals.filter((terminal) => terminal.kind === "agent");
    const agentIds = new Set([...ptyAgents.map((agent) => agent.id), ...scopedSessions.map((session) => session.id)]);
    const liveAgentIds = new Set([...ptyAgents.filter((agent) => agent.alive).map((agent) => agent.id), ...scopedSessions.filter((session) => session.status === "live" || session.status === "waiting").map((session) => session.id)]);
    return {
      acpSessions: scopedSessions,
      focusedSessionId: current.focusedSessionId && agentIds.has(current.focusedSessionId) ? current.focusedSessionId : ptyAgents[0]?.id ?? scopedSessions[0]?.id,
      pinnedSessionId: current.pinnedSessionId && agentIds.has(current.pinnedSessionId) ? current.pinnedSessionId : undefined,
      referenceTargetId: current.referenceTargetId && liveAgentIds.has(current.referenceTargetId) ? current.referenceTargetId : undefined,
    };
  }),
  addAcpSession: (session) => set((current) => {
    if (current.activeProjectId && session.projectId !== current.activeProjectId) return current;
    const index = current.acpSessions.findIndex((candidate) => candidate.id === session.id);
    if (index < 0) return { acpSessions: [...current.acpSessions, session] };
    const existing = current.acpSessions[index];
    if (!existing) return current;
    const acpSessions = [...current.acpSessions];
    acpSessions[index] = { ...session, ...existing };
    return { acpSessions };
  }),
  updateAcpSession: (id, update) => set((current) => ({ acpSessions: current.acpSessions.map((session) => session.id === id ? { ...session, ...update } : session) })),
  applyAcpEvent: (event) => set((current) => {
    const next = applyAcpServerEvent({
      projectId: current.activeProjectId,
      sessions: current.acpSessions,
      history: current.acpHistory,
      lastSequences: current.acpSequences,
      queued: current.acpQueued,
    }, event);
    const ptyAgents = current.terminals.filter((terminal) => terminal.kind === "agent");
    const agentIds = new Set([...ptyAgents.map((agent) => agent.id), ...next.sessions.map((session) => session.id)]);
    const liveAgentIds = new Set([...ptyAgents.filter((agent) => agent.alive).map((agent) => agent.id), ...next.sessions.filter((session) => session.status === "live" || session.status === "waiting").map((session) => session.id)]);
    return {
      acpSessions: next.sessions,
      acpHistory: next.history,
      acpSequences: next.lastSequences,
      acpQueued: next.queued,
      focusedSessionId: current.focusedSessionId && agentIds.has(current.focusedSessionId) ? current.focusedSessionId : ptyAgents[0]?.id ?? next.sessions[0]?.id,
      pinnedSessionId: current.pinnedSessionId && agentIds.has(current.pinnedSessionId) ? current.pinnedSessionId : undefined,
      referenceTargetId: current.referenceTargetId && liveAgentIds.has(current.referenceTargetId) ? current.referenceTargetId : undefined,
    };
  }),
  setAcpDraft: (id, draft) => set((current) => ({ acpDrafts: { ...current.acpDrafts, [id]: draft } })),
  updateAcpDraft: (id, update) => set((current) => ({ acpDrafts: { ...current.acpDrafts, [id]: { ...(current.acpDrafts[id] ?? { text: "", references: [] }), ...update } } })),
  clearAcpDraft: (id) => set((current) => {
    const acpDrafts = { ...current.acpDrafts };
    delete acpDrafts[id];
    return { acpDrafts };
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
    if (terminalMaximized) {
      persistTerminalCollapsed(false);
      set({ terminalMaximized: true, terminalCollapsed: false });
      return;
    }
    set({ terminalMaximized: false });
  },
  setTerminalError: (terminalError) => set({ terminalError }),
  setVersion: (version) => set({ version }),
  setBuildCommands: (buildCommands) => set({ buildCommands }),
  setBuildSelection: (projectId, label) => {
    persistBuildSelection(projectId, label);
    set((current) => ({ buildSelections: { ...current.buildSelections, [projectId]: label } }));
  },
  setPendingLocation: (pendingLocation) => set({ pendingLocation }),
  setProjectSession: (input) => set((current) => ({
    activeProjectId: input.activeProjectId,
    openProjects: input.openProjects,
    knownProjects: input.knownProjects,
    restoreError: input.restoreError,
    ...(current.activeProjectId !== input.activeProjectId ? { acpHistory: {}, acpSequences: {}, acpQueued: {}, gitComparisons: {} } : {}),
  })),
  stashActiveBag: () => set((current) => {
    if (!current.activeProjectId) return current;
    return { projectBags: { ...current.projectBags, [current.activeProjectId]: captureProjectBag(current) } };
  }),
  restoreProjectBag: (projectId, workspace, fallback) => set((current) => {
    const bag = current.projectBags[projectId] ?? fallback ?? emptyProjectBag();
    const projectChanged = current.activeProjectId !== projectId;
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
      acpSessions: bag.acpSessions,
      acpHistory: bag.acpHistory,
      acpDrafts: bag.acpDrafts,
      acpSequences: {},
      acpQueued: {},
      activeTerminalId: bag.activeTerminalId,
      referenceKit: bag.referenceKit,
      focusedSessionId: bag.focusedSessionId,
      pinnedSessionId: bag.pinnedSessionId,
      toolSessionId: bag.toolSessionId,
      referenceTargetId: bag.referenceTargetId,
      recentChanges: bag.recentChanges,
      review: { ...bag.review, url: undefined, message: undefined, loading: false },
      ...(projectChanged ? { gitComparisons: {} } : {}),
    };
  }),
  applyDiskTabs: (tabs) => set({ tabs }),
  clearActiveProject: () => set({
    workspace: undefined,
    activeProjectId: undefined,
    ...emptyProjectBag(),
    acpSequences: {},
    acpQueued: {},
    gitComparisons: {},
  }),
  removeProjectBag: (projectId) => set((current) => {
    const projectBags = { ...current.projectBags };
    delete projectBags[projectId];
    const gitComparisons = Object.fromEntries(Object.entries(current.gitComparisons).filter(([, comparison]) => comparison.projectId !== projectId));
    return { projectBags, gitComparisons };
  }),
  renameTabPath: (from, to) => set((current) => {
    const name = to.split(/[\\/]/).filter(Boolean).pop() ?? to;
    const tabs = current.tabs.map((tab) => (tab.path === from ? { ...tab, path: to, name, language: language(to) } : tab));
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

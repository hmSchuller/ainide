import { create } from "zustand";
import type { FileEntry, GitStatus, TerminalSession, Workspace } from "@ainide/shared";
import type { AppMode, DirectoryState, EditorTab, Notice, ReviewState } from "./types";

interface AppState {
  token: string;
  workspace?: Workspace;
  mode: AppMode;
  directories: Record<string, DirectoryState>;
  expanded: Record<string, boolean>;
  explorerWidth: number;
  terminalHeight: number;
  selectedPath?: string;
  tabs: EditorTab[];
  activePath?: string;
  git?: GitStatus;
  terminals: TerminalSession[];
  activeTerminalId?: string;
  terminalCollapsed: boolean;
  terminalMaximized: boolean;
  notices: Notice[];
  review: ReviewState;
  recentChanges: Record<string, number>;
  terminalError?: string;
  pendingLocation?: { path: string; line: number; column?: number };
  setToken: (token: string) => void;
  setWorkspace: (workspace?: Workspace) => void;
  setDirectory: (path: string, state: DirectoryState) => void;
  toggleDirectory: (path: string) => void;
  setSelected: (path?: string) => void;
  addTab: (tab: EditorTab) => void;
  updateTab: (path: string, update: Partial<EditorTab>) => void;
  closeTab: (path: string) => void;
  setActivePath: (path?: string) => void;
  setGit: (git?: GitStatus) => void;
  setTerminals: (terminals: TerminalSession[]) => void;
  addTerminal: (terminal: TerminalSession) => void;
  updateTerminal: (id: string, update: Partial<TerminalSession>) => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  setReview: (review: Partial<ReviewState>) => void;
  markRecent: (path: string) => void;
  setNotice: (text: string, tone?: Notice["tone"]) => void;
  dismissNotice: (id: number) => void;
  setMode: (mode: AppMode) => void;
  setTerminalCollapsed: (collapsed: boolean) => void;
  setTerminalMaximized: (maximized: boolean) => void;
  setTerminalError: (error?: string) => void;
  setPendingLocation: (location?: AppState["pendingLocation"]) => void;
}

const savedNumber = (key: string, fallback: number): number => {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const useAppStore = create<AppState>((set) => ({
  token: "",
  mode: "edit",
  directories: {},
  expanded: {},
  explorerWidth: savedNumber("ainide:explorer-width", 248),
  terminalHeight: savedNumber("ainide:terminal-height", 260),
  tabs: [],
  terminals: [],
  terminalCollapsed: false,
  terminalMaximized: false,
  notices: [],
  review: { loading: false, scope: "working-tree" },
  recentChanges: {},
  setToken: (token) => set({ token }),
  setWorkspace: (workspace) => set({ workspace, directories: {}, expanded: {}, selectedPath: undefined }),
  setDirectory: (path, state) => set((current) => ({ directories: { ...current.directories, [path]: state } })),
  toggleDirectory: (path) => set((current) => ({ expanded: { ...current.expanded, [path]: !current.expanded[path] } })),
  setSelected: (selectedPath) => set({ selectedPath }),
  addTab: (tab) => set((current) => ({ tabs: current.tabs.some((item) => item.path === tab.path) ? current.tabs : [...current.tabs, tab], activePath: tab.path })),
  updateTab: (path, update) => set((current) => ({ tabs: current.tabs.map((tab) => (tab.path === path ? { ...tab, ...update } : tab)) })),
  closeTab: (path) => set((current) => {
    const index = current.tabs.findIndex((tab) => tab.path === path);
    const tabs = current.tabs.filter((tab) => tab.path !== path);
    const activePath = current.activePath === path ? tabs[Math.max(0, index - 1)]?.path : current.activePath;
    return { tabs, activePath };
  }),
  setActivePath: (activePath) => set({ activePath }),
  setGit: (git) => set({ git }),
  setTerminals: (terminals) => set((current) => ({ terminals, activeTerminalId: current.activeTerminalId && terminals.some((item) => item.id === current.activeTerminalId) ? current.activeTerminalId : terminals[0]?.id })),
  addTerminal: (terminal) => set((current) => ({ terminals: [...current.terminals, terminal], activeTerminalId: terminal.id })),
  updateTerminal: (id, update) => set((current) => ({ terminals: current.terminals.map((terminal) => terminal.id === id ? { ...terminal, ...update } : terminal) })),
  removeTerminal: (id) => set((current) => ({ terminals: current.terminals.filter((item) => item.id !== id), activeTerminalId: current.activeTerminalId === id ? current.terminals.find((item) => item.id !== id)?.id : current.activeTerminalId })),
  setActiveTerminal: (activeTerminalId) => set({ activeTerminalId }),
  setReview: (review) => set((current) => ({ review: { ...current.review, ...review } })),
  markRecent: (path) => set((current) => ({ recentChanges: { ...current.recentChanges, [path]: Date.now() } })),
  setNotice: (text, tone = "info") => set((current) => ({ notices: [...current.notices, { id: Date.now() + Math.random(), text, tone }] })),
  dismissNotice: (id) => set((current) => ({ notices: current.notices.filter((notice) => notice.id !== id) })),
  setMode: (mode) => set({ mode }),
  setTerminalCollapsed: (terminalCollapsed) => set({ terminalCollapsed }),
  setTerminalMaximized: (terminalMaximized) => set({ terminalMaximized, terminalCollapsed: false }),
  setTerminalError: (terminalError) => set({ terminalError }),
  setPendingLocation: (pendingLocation) => set({ pendingLocation }),
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

export type GitFileStatusKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface Workspace {
  rootPath: string;
  name: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  gitStatus?: GitFileStatusKind;
  recent?: boolean;
}

export interface GitFileStatus {
  path: string;
  status: GitFileStatusKind;
}

export interface GitStatus {
  branch?: string;
  dirty: boolean;
  isRepository: boolean;
  files: GitFileStatus[];
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

export type TerminalKind = "agent" | "shell" | "lazygit" | "custom";

export interface TerminalSession {
  id: string;
  title: string;
  command: string;
  cwd: string;
  pid?: number;
  alive: boolean;
  kind: TerminalKind;
  projectId: string;
}

export type TerminalClientMessage =
  | { type: "input"; sessionId: string; data: string }
  | { type: "resize"; sessionId: string; cols: number; rows: number }
  | { type: "attach"; sessionId: string };

export type TerminalServerMessage =
  | { type: "output"; sessionId: string; data: string }
  | { type: "exit"; sessionId: string; exitCode: number | null }
  | { type: "attached"; sessionId: string };

export interface RecentChange {
  path: string;
  type: "changed" | "created" | "deleted";
  timestamp: number;
}

export type WorkspaceEvent =
  | { type: "file_changed"; projectId: string; path: string; change: RecentChange["type"] }
  | { type: "git_changed"; projectId: string; status: GitStatus }
  | { type: "workspace_changed"; projectId: string };

export interface ProjectRef {
  projectId: string;
  rootPath: string;
  name: string;
}

export interface PaneSnapshot {
  tabPaths: string[];
  activePath?: string;
}

export interface ProjectSessionSnapshot {
  rootPath: string;
  name: string;
  openFilePaths: string[];
  panes: {
    primary: PaneSnapshot;
    secondary: PaneSnapshot;
  };
  secondaryOpen: boolean;
  expandedPaths: string[];
  mode: "edit" | "review";
  terminalKinds: TerminalKind[];
}

export interface SessionSnapshot {
  version: number;
  activeRootPath?: string;
  projects: ProjectSessionSnapshot[];
}

export interface SessionBootstrap {
  token: string;
  openProjects: ProjectRef[];
  knownProjects: ProjectRef[];
  activeProjectId: string | null;
  workspace: Workspace | null;
  snapshot?: ProjectSessionSnapshot;
  restoreError?: string;
}

export interface ReviewStatus {
  running: boolean;
  available: boolean;
  url?: string;
  pid?: number;
  message?: string;
}

export type ReviewScope = "working-tree" | "staged" | "last-commit" | "branch-vs-main";

export const DEFAULT_TERMINAL_KINDS: TerminalKind[] = ["agent", "shell", "lazygit"];

export function missingTerminalKinds(
  sessions: Array<{ kind: TerminalKind; alive: boolean }>,
  wanted: TerminalKind[] = DEFAULT_TERMINAL_KINDS,
): TerminalKind[] {
  const living = new Set(sessions.filter((session) => session.alive).map((session) => session.kind));
  return wanted.filter((kind) => !living.has(kind));
}

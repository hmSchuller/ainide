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

export interface TerminalSession {
  id: string;
  title: string;
  command: string;
  cwd: string;
  pid?: number;
  alive: boolean;
  kind: "agent" | "shell" | "lazygit" | "custom";
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
  | { type: "file_changed"; path: string; change: RecentChange["type"] }
  | { type: "git_changed"; status: GitStatus }
  | { type: "workspace_changed" };

export interface ReviewStatus {
  running: boolean;
  available: boolean;
  url?: string;
  pid?: number;
  message?: string;
}

export type ReviewScope = "working-tree" | "staged" | "last-commit" | "branch-vs-main";

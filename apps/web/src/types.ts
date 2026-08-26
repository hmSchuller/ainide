import type { FileEntry, GitStatus, ReviewScope, TerminalSession, Workspace } from "@ainide/shared";

export type AppMode = "edit" | "review";

export interface EditorTab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  language: string;
  binary?: boolean;
  error?: string;
  conflict?: { externalContent?: string };
}

export interface SessionResponse {
  token?: string;
  sessionToken?: string;
  workspace?: Workspace | null;
}

export interface DirectoryState {
  entries: FileEntry[];
  loading: boolean;
  error?: string;
}

export interface ReviewState {
  loading: boolean;
  scope: ReviewScope;
  url?: string;
  available?: boolean;
  message?: string;
}

export interface Notice {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
}

export interface TerminalResponse {
  sessions?: TerminalSession[];
  terminal?: TerminalSession;
  session?: TerminalSession;
}

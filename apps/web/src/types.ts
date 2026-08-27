import type { AppMode, FileEntry, GitStatus, ReviewScope, SessionBootstrap, TerminalSession } from "@ainide/shared";
import type { ReferenceItem } from "./references";

export type { AppMode };
export type EditorPaneId = "primary" | "secondary";

export interface EditorPaneState {
  tabPaths: string[];
  activePath?: string;
}

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

export interface SessionResponse extends SessionBootstrap {
  sessionToken?: string;
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

export type ProjectReferenceKit = ReferenceItem[];

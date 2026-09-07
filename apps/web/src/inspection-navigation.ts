import type { ReviewScope } from "@ainide/shared";
import type { AppMode, EditorPaneId } from "./types";

export type InspectionKind = "file" | "diff";
export type InspectionReviewScope = ReviewScope;

export interface InspectionReturnLocation {
  projectId: string;
  sessionId: string;
  turnId?: string;
  activityId?: string;
  mode: "agents" | "review";
  kind: InspectionKind;
  reviewScope?: InspectionReviewScope;
  /** Browser-local conversation state; never sent to the server. */
  conversation?: {
    scrollTop?: number;
  };
  viewport: {
    path?: string;
    line?: number;
    column?: number;
    paneId?: EditorPaneId;
    scrollTop?: number;
  };
}

export interface AgentReferenceLocation {
  projectId?: string;
  sessionId?: string;
  turnId?: string;
  activityId?: string;
}

const returnLocations = new Map<string, InspectionReturnLocation>();
let activeReturnKey: string | undefined;
const listeners = new Set<() => void>();

function returnKey(location: Pick<InspectionReturnLocation, "projectId" | "sessionId">): string {
  return `${location.projectId}\u0000${location.sessionId}`;
}

function notify(): void { listeners.forEach((listener) => { listener(); }); }

export function captureInspectionReturn(location: InspectionReturnLocation): void {
  const key = returnKey(location);
  returnLocations.set(key, location);
  activeReturnKey = key;
  notify();
}

export function getInspectionReturn(projectId?: string, sessionId?: string): InspectionReturnLocation | undefined {
  if (projectId && sessionId) return returnLocations.get(`${projectId}\u0000${sessionId}`);
  return activeReturnKey ? returnLocations.get(activeReturnKey) : undefined;
}

export function clearInspectionReturn(location?: InspectionReturnLocation): void {
  const key = location ? returnKey(location) : activeReturnKey;
  if (!key) return;
  returnLocations.delete(key);
  if (activeReturnKey === key) activeReturnKey = undefined;
  notify();
}

export function subscribeInspectionReturn(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function inspectionMode(mode: AppMode): InspectionReturnLocation["mode"] | undefined {
  return mode === "agents" || mode === "review" ? mode : undefined;
}

function safeInspectionPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path.replaceAll("\\", "/");
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) return undefined;
  if (normalized.split("/").some((part) => part === "..")) return undefined;
  return normalized.replace(/^\.\//, "");
}

function positiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function makeInspectionReturnLocation(input: {
  projectId: string;
  sessionId: string;
  mode: "agents" | "review";
  turnId?: string;
  activityId?: string;
  kind?: InspectionKind;
  reviewScope?: InspectionReviewScope;
  path?: string;
  line?: number;
  column?: number;
  paneId?: EditorPaneId;
  scrollTop?: number;
  conversationScrollTop?: number;
}): InspectionReturnLocation {
  const path = safeInspectionPath(input.path);
  const kind = input.kind ?? "file";
  const reviewScope = kind === "diff" ? (input.reviewScope ?? "working-tree") : undefined;
  return {
    projectId: input.projectId,
    sessionId: input.sessionId,
    ...(input.turnId ? { turnId: input.turnId } : {}),
    ...(input.activityId ? { activityId: input.activityId } : {}),
    mode: input.mode,
    kind,
    ...(reviewScope ? { reviewScope } : {}),
    ...(input.conversationScrollTop !== undefined && Number.isFinite(input.conversationScrollTop) && input.conversationScrollTop >= 0 ? { conversation: { scrollTop: input.conversationScrollTop } } : {}),
    viewport: {
      ...(path ? { path } : {}),
      ...(positiveInteger(input.line) ? { line: positiveInteger(input.line) } : {}),
      ...(positiveInteger(input.column) ? { column: positiveInteger(input.column) } : {}),
      ...(input.paneId ? { paneId: input.paneId } : {}),
      ...(input.scrollTop !== undefined && Number.isFinite(input.scrollTop) && input.scrollTop >= 0 ? { scrollTop: input.scrollTop } : {}),
    },
  };
}

export function formatInspectionReturn(location: InspectionReturnLocation): string {
  return `Return to agent session${location.turnId ? ` · turn ${location.turnId}` : ""}`;
}

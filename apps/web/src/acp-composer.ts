import type { AcpPromptRequest } from "@ainide/shared";
import type { AcpPromptDraft } from "./project-ui";
import { promptContextFromReferences } from "./references";

export const ACP_SEND_LABEL = "Send Enter";

export type AcpComposerKeyAction =
  | "ignore"
  | "newline"
  | "move-down"
  | "move-up"
  | "select-command"
  | "dismiss-completion"
  | "submit";

export interface AcpComposerKeyInput {
  key: string;
  completionOpen: boolean;
  isComposing?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

export function acpComposerKeyAction(input: AcpComposerKeyInput): AcpComposerKeyAction {
  if (input.isComposing) return "ignore";
  if (input.key === "Enter" && input.shiftKey) return "newline";
  if (input.completionOpen && input.key === "ArrowDown") return "move-down";
  if (input.completionOpen && input.key === "ArrowUp") return "move-up";
  if (input.completionOpen && input.key === "Escape") return "dismiss-completion";

  const hasSubmitModifier = Boolean(input.metaKey || input.ctrlKey);
  const hasOtherModifier = Boolean(input.altKey || input.shiftKey);
  if (input.key === "Enter" && hasSubmitModifier && !input.altKey) return "submit";
  if (input.completionOpen && input.key === "Enter" && !hasSubmitModifier && !hasOtherModifier) return "select-command";
  if (input.completionOpen && input.key === "Tab" && !hasSubmitModifier && !input.altKey) return "select-command";
  if (!input.completionOpen && input.key === "Enter" && !hasSubmitModifier && !hasOtherModifier) return "submit";
  return "ignore";
}

export interface AcpPromptSubmission {
  snapshot: AcpPromptDraft;
  request: AcpPromptRequest;
}

export type AcpComposerState = "ready" | "active" | "waiting" | "auth_required" | "exited" | "failed" | "review_ready";

export interface AcpComposerStateInput {
  activePrompt: boolean;
  status: string;
  pendingRequest?: boolean;
  reviewReady?: boolean;
}

export function acpComposerState(input: AcpComposerStateInput): AcpComposerState {
  if (input.status === "auth_required") return "auth_required";
  if (input.status === "exited" || input.status === "non_resumable") return "exited";
  if (input.status === "failed" || input.status === "disconnected") return "failed";
  if (input.reviewReady) return "review_ready";
  if (input.pendingRequest) return "waiting";
  if (input.activePrompt) return "active";
  return "ready";
}

export interface AcpQueuedPrompt extends AcpPromptSubmission {
  id: string;
  state: "queued" | "dispatching";
}

let nextQueuedPromptId = 0;

export function enqueueAcpPrompt(queue: readonly AcpQueuedPrompt[], draft: AcpPromptDraft, id = `queued-${++nextQueuedPromptId}`): AcpQueuedPrompt[] {
  const submission = prepareAcpPromptSubmission(draft);
  if (!submission) return [...queue];
  return [...queue, { id, state: "queued", ...submission }];
}

export function removeQueuedAcpPrompt(queue: readonly AcpQueuedPrompt[], id: string): AcpQueuedPrompt[] {
  return queue.filter((item) => item.id !== id);
}

export function moveQueuedAcpPrompt(queue: readonly AcpQueuedPrompt[], id: string, direction: -1 | 1): AcpQueuedPrompt[] {
  const index = queue.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= queue.length) return [...queue];
  const next = [...queue];
  const item = next[index];
  const replacement = next[target];
  if (!item || !replacement) return next;
  next[index] = replacement;
  next[target] = item;
  return next;
}

export function canDispatchAcpPrompt(state: AcpComposerState): boolean {
  return state === "ready";
}

export function prepareAcpPromptSubmission(draft: AcpPromptDraft): AcpPromptSubmission | undefined {
  const snapshot: AcpPromptDraft = { text: draft.text, references: [...draft.references] };
  const text = snapshot.text.trim() || (snapshot.references.length ? "Review the selected references." : "");
  if (!text) return undefined;
  return {
    snapshot,
    request: {
      text,
      ...(snapshot.references.length ? { context: promptContextFromReferences(snapshot.references) } : {}),
    },
  };
}

export function isAcpPromptDraftEmpty(draft: AcpPromptDraft): boolean {
  return draft.text === "" && draft.references.length === 0;
}

export interface DispatchAcpPromptInput {
  draft: AcpPromptDraft;
  activePrompt: boolean;
  authRequired: boolean;
  dispatch: (request: AcpPromptRequest) => Promise<void>;
  clear: () => void;
  getCurrentDraft: () => AcpPromptDraft;
  restore: (draft: AcpPromptDraft) => void;
  notifyFailure: (error: unknown) => void;
}

export function dispatchAcpPrompt(input: DispatchAcpPromptInput): boolean {
  if (input.activePrompt || input.authRequired) return false;
  const submission = prepareAcpPromptSubmission(input.draft);
  if (!submission) return false;

  input.clear();
  const recover = (error: unknown) => {
    if (isAcpPromptDraftEmpty(input.getCurrentDraft())) input.restore(submission.snapshot);
    input.notifyFailure(error);
  };
  try {
    void input.dispatch(submission.request).catch(recover);
  } catch (error) {
    recover(error);
  }
  return true;
}

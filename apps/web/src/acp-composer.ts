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

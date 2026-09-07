import type { AcpSession } from "@ainide/shared";
import { isAcpPromptDraftEmpty } from "./acp-composer";
import type { AcpPromptDraft } from "./project-ui";

export const ACP_NEW_COMMAND_GUIDANCE = "Cancel the active prompt first";

export interface AcpRecoveryInput {
  dispatch: () => Promise<AcpSession>;
  addSession: (session: AcpSession) => void;
  focusSession: (sessionId: string) => void;
  notifyFailure: (error: unknown) => void;
}

export function freshAcpSessionTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed ? `Fresh session · ${trimmed}` : "Fresh ACP session";
}

/** Start an independent ACP session; this intentionally does not resume or replace the source session. */
export async function dispatchAcpRecovery(input: AcpRecoveryInput): Promise<boolean> {
  try {
    const session = await input.dispatch();
    input.addSession(session);
    input.focusSession(session.id);
    return true;
  } catch (error) {
    input.notifyFailure(error);
    return false;
  }
}

export interface AcpRolloverInput {
  activePrompt: boolean;
  authRequired: boolean;
  live: boolean;
  dispatch: () => Promise<AcpSession>;
  clearDraft: () => void;
  getCurrentDraft: () => AcpPromptDraft;
  restoreDraft: (draft: AcpPromptDraft) => void;
  adoptSession: (session: AcpSession) => void;
  notifyFailure: (error: unknown) => void;
}

export function isAcpRolloverSelectable(input: { activePrompt: boolean; authRequired: boolean; live: boolean }): boolean {
  return input.live && !input.activePrompt && !input.authRequired;
}

export function dispatchAcpRollover(input: AcpRolloverInput): boolean {
  if (input.activePrompt) {
    input.notifyFailure(new Error(ACP_NEW_COMMAND_GUIDANCE));
    return false;
  }
  if (input.authRequired) {
    input.notifyFailure(new Error("Authenticate the provider before starting a new context"));
    return false;
  }
  if (!input.live) {
    input.notifyFailure(new Error("This ACP session is not live"));
    return false;
  }
  const current = input.getCurrentDraft();
  const snapshot: AcpPromptDraft = { text: current.text, references: [...current.references] };
  input.clearDraft();
  const recover = (error: unknown) => {
    if (isAcpPromptDraftEmpty(input.getCurrentDraft())) input.restoreDraft(snapshot);
    input.notifyFailure(error);
  };
  try {
    void input.dispatch().then(input.adoptSession, recover);
  } catch (error) {
    recover(error);
  }
  return true;
}

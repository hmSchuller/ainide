import { describe, expect, it, vi } from "vitest";
import type { AcpPromptRequest } from "@ainide/shared";
import { acpComposerKeyAction, dispatchAcpPrompt } from "./acp-composer";
import type { AcpPromptDraft } from "./project-ui";
import type { ReferenceItem } from "./references";

const reference: ReferenceItem = {
  id: "ref-1",
  path: "src/app.ts",
  startLine: 3,
  endLine: 5,
  wholeFile: false,
  content: "const value = 1;",
  language: "typescript",
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function emptyDraft(): AcpPromptDraft {
  return { text: "", references: [] };
}

function dispatchInput(overrides: Partial<Parameters<typeof dispatchAcpPrompt>[0]> = {}) {
  let currentDraft: AcpPromptDraft = overrides.draft ?? { text: "fix this", references: [] };
  const request = deferred<void>();
  const dispatch = vi.fn<(prompt: AcpPromptRequest) => Promise<void>>(() => request.promise);
  const clear = vi.fn(() => { currentDraft = emptyDraft(); });
  const restore = vi.fn((draft: AcpPromptDraft) => { currentDraft = draft; });
  const notifyFailure = vi.fn();
  const input: Parameters<typeof dispatchAcpPrompt>[0] = {
    draft: currentDraft,
    activePrompt: false,
    authRequired: false,
    dispatch,
    clear,
    getCurrentDraft: () => currentDraft,
    restore,
    notifyFailure,
    ...overrides,
  };
  return { input, request, dispatch, clear, restore, notifyFailure, getCurrentDraft: () => currentDraft, setCurrentDraft: (draft: AcpPromptDraft) => { currentDraft = draft; } };
}

describe("ACP composer keyboard actions", () => {
  it("gives IME composition and Shift+Enter precedence over completion and submission", () => {
    expect(acpComposerKeyAction({ key: "Enter", completionOpen: true, isComposing: true })).toBe("ignore");
    expect(acpComposerKeyAction({ key: "Enter", completionOpen: false, isComposing: true })).toBe("ignore");
    expect(acpComposerKeyAction({ key: "Enter", completionOpen: true, shiftKey: true })).toBe("newline");
    expect(acpComposerKeyAction({ key: "Enter", completionOpen: false, shiftKey: true })).toBe("newline");
  });

  it("selects the active suggestion with Enter or Tab before ordinary submission", () => {
    expect(acpComposerKeyAction({ key: "Enter", completionOpen: true })).toBe("select-command");
    expect(acpComposerKeyAction({ key: "Tab", completionOpen: true })).toBe("select-command");
    expect(acpComposerKeyAction({ key: "Tab", completionOpen: true, shiftKey: true })).toBe("select-command");
    expect(acpComposerKeyAction({ key: "Enter", completionOpen: false })).toBe("submit");
    expect(acpComposerKeyAction({ key: "Enter", completionOpen: true, ctrlKey: true })).toBe("submit");
    expect(acpComposerKeyAction({ key: "Enter", completionOpen: false, metaKey: true })).toBe("submit");
  });

  it("keeps completion navigation and dismissal distinct from submit", () => {
    expect(acpComposerKeyAction({ key: "ArrowDown", completionOpen: true })).toBe("move-down");
    expect(acpComposerKeyAction({ key: "ArrowUp", completionOpen: true })).toBe("move-up");
    expect(acpComposerKeyAction({ key: "Escape", completionOpen: true })).toBe("dismiss-completion");
    expect(acpComposerKeyAction({ key: "Enter", completionOpen: true, shiftKey: true, ctrlKey: true })).toBe("newline");
  });
});

describe("ACP composer prompt dispatch", () => {
  it("clears before a deferred dispatch and preserves the trimmed payload and context", () => {
    const { input, request, dispatch, clear, getCurrentDraft } = dispatchInput({ draft: { text: "  fix this  ", references: [reference] } });

    expect(dispatchAcpPrompt(input)).toBe(true);
    expect(clear).toHaveBeenCalledOnce();
    expect(getCurrentDraft()).toEqual(emptyDraft());
    expect(dispatch).toHaveBeenCalledWith({
      text: "fix this",
      context: [{ path: "src/app.ts", content: reference.content, language: "typescript", startLine: 3, endLine: 5 }],
    });
    request.resolve();
  });

  it("supports reference-only prompts", () => {
    const { input, dispatch, request } = dispatchInput({ draft: { text: "", references: [reference] } });

    expect(dispatchAcpPrompt(input)).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({ text: "Review the selected references.", context: expect.any(Array) });
    request.resolve();
  });

  it("submits multiline drafts without changing their internal newlines", () => {
    const { input, dispatch, request } = dispatchInput({ draft: { text: "first line\nsecond line", references: [] } });

    expect(dispatchAcpPrompt(input)).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({ text: "first line\nsecond line" });
    request.resolve();
  });

  it("does not dispatch or clear guarded submissions", () => {
    const empty = dispatchInput({ draft: emptyDraft() });
    const active = dispatchInput({ activePrompt: true });
    const unauthenticated = dispatchInput({ authRequired: true });

    expect(dispatchAcpPrompt(empty.input)).toBe(false);
    expect(dispatchAcpPrompt(active.input)).toBe(false);
    expect(dispatchAcpPrompt(unauthenticated.input)).toBe(false);
    expect(empty.clear).not.toHaveBeenCalled();
    expect(active.clear).not.toHaveBeenCalled();
    expect(unauthenticated.clear).not.toHaveBeenCalled();
    expect(empty.dispatch).not.toHaveBeenCalled();
    expect(active.dispatch).not.toHaveBeenCalled();
    expect(unauthenticated.dispatch).not.toHaveBeenCalled();
    expect(empty.getCurrentDraft()).toEqual(emptyDraft());
  });

  it("restores the exact whitespace-preserving snapshot after a failed dispatch", async () => {
    const draft = { text: "  retry with spaces  ", references: [reference] };
    const { input, request, restore, notifyFailure, getCurrentDraft } = dispatchInput({ draft });

    dispatchAcpPrompt(input);
    request.reject(new Error("offline"));
    await request.promise.catch(() => undefined);
    await Promise.resolve();

    expect(restore).toHaveBeenCalledWith(draft);
    expect(getCurrentDraft()).toEqual(draft);
    expect(notifyFailure).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }));
  });

  it("preserves replacement text and references after a failed dispatch", async () => {
    const replacement = { text: "new prompt", references: [reference] };
    const { input, request, restore, notifyFailure, getCurrentDraft, setCurrentDraft } = dispatchInput();

    dispatchAcpPrompt(input);
    setCurrentDraft(replacement);
    request.reject(new Error("offline"));
    await request.promise.catch(() => undefined);
    await Promise.resolve();

    expect(restore).not.toHaveBeenCalled();
    expect(getCurrentDraft()).toEqual(replacement);
    expect(notifyFailure).toHaveBeenCalledOnce();
  });

  it("leaves replacement content untouched after successful completion", async () => {
    const replacement = { text: "new prompt", references: [reference] };
    const { input, request, restore, getCurrentDraft, setCurrentDraft } = dispatchInput();

    dispatchAcpPrompt(input);
    setCurrentDraft(replacement);
    request.resolve();
    await request.promise;
    await Promise.resolve();

    expect(restore).not.toHaveBeenCalled();
    expect(getCurrentDraft()).toEqual(replacement);
  });
});

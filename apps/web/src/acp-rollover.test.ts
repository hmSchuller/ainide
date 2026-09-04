import type { AcpSession } from "@ainide/shared";
import { describe, expect, it, vi } from "vitest";
import { dispatchAcpRollover, isAcpRolloverSelectable } from "./acp-rollover";

const otherSession: AcpSession = { id: "same", title: "Fresh provider", titleSource: "provider", projectId: "/project", providerId: "fake", providerLabel: "Fake provider", authMethods: [], status: "live", capabilities: { canCancel: true, canClose: false, canLoad: true, canList: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true }, configOptions: [], availableCommands: [], pendingRequests: [], activePrompt: false, resumability: "resumable" };

function baseInput(overrides: Partial<Parameters<typeof dispatchAcpRollover>[0]> = {}): Parameters<typeof dispatchAcpRollover>[0] {
  return {
    activePrompt: false,
    authRequired: false,
    live: true,
    dispatch: vi.fn(async () => otherSession),
    clearDraft: vi.fn(),
    getCurrentDraft: vi.fn(() => ({ text: "", references: [] })),
    restoreDraft: vi.fn(),
    adoptSession: vi.fn(),
    notifyFailure: vi.fn(),
    ...overrides,
  };
}

describe("ACP rollover dispatch", () => {
  it("clears the draft, adopts the returned session, and restores nothing on success", async () => {
    const input = baseInput({ getCurrentDraft: vi.fn(() => ({ text: "/new", references: [] })) });
    expect(dispatchAcpRollover(input)).toBe(true);
    expect(input.clearDraft).toHaveBeenCalledOnce();
    expect(input.getCurrentDraft).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(input.adoptSession).toHaveBeenCalledWith(otherSession);
      expect(input.restoreDraft).not.toHaveBeenCalled();
      expect(input.notifyFailure).not.toHaveBeenCalled();
    });
  });

  it("keeps the draft and session and reports the guidance while a prompt is active", () => {
    const input = baseInput({
      activePrompt: true,
      dispatch: vi.fn(async () => otherSession),
    });
    expect(dispatchAcpRollover(input)).toBe(false);
    expect(input.clearDraft).not.toHaveBeenCalled();
    expect(input.dispatch).not.toHaveBeenCalled();
    expect(input.notifyFailure).toHaveBeenCalledOnce();
    expect(vi.mocked(input.notifyFailure).mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(String(vi.mocked(input.notifyFailure).mock.calls[0]?.[0])).toContain("Cancel the active prompt first");
  });

  it("reports authentication and non-live guards without dispatching", () => {
    const authInput = baseInput({ authRequired: true });
    expect(dispatchAcpRollover(authInput)).toBe(false);
    expect(authInput.notifyFailure).toHaveBeenCalledTimes(1);

    const deadInput = baseInput({ live: false });
    expect(dispatchAcpRollover(deadInput)).toBe(false);
    expect(deadInput.notifyFailure).toHaveBeenCalledTimes(1);
  });

  it("restores the draft and shows a notice when the rollover request fails", async () => {
    const restoredDraft = { text: "/new", references: [] };
    const input = baseInput({
      dispatch: vi.fn(async () => {
        throw new Error("Rollover failed");
      }),
      getCurrentDraft: vi.fn()
        .mockReturnValueOnce({ text: "/new", references: [] })
        .mockReturnValue({ text: "", references: [] }),
    });
    expect(dispatchAcpRollover(input)).toBe(true);
    expect(input.clearDraft).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(input.restoreDraft).toHaveBeenCalledWith({ text: "/new", references: [] });
      expect(input.adoptSession).not.toHaveBeenCalled();
      expect(input.notifyFailure).toHaveBeenCalledOnce();
    });
    expect(restoredDraft.text).toBe("/new");
  });

  it("does not clobber a draft the user rebuilt while the request was failing", async () => {
    const rebuilt = { text: "fresh instructions", references: [] };
    const input = baseInput({
      dispatch: vi.fn(async () => {
        throw new Error("Rollover failed");
      }),
      getCurrentDraft: vi.fn()
        .mockReturnValueOnce({ text: "/new", references: [] })
        .mockReturnValue(rebuilt),
    });
    expect(dispatchAcpRollover(input)).toBe(true);
    await vi.waitFor(() => expect(input.notifyFailure).toHaveBeenCalledOnce());
    expect(input.restoreDraft).not.toHaveBeenCalled();
    expect(rebuilt.text).toBe("fresh instructions");
  });

  it("selects rollover only for a live, unauthenticated-free, idle session", () => {
    expect(isAcpRolloverSelectable({ activePrompt: false, authRequired: false, live: true })).toBe(true);
    expect(isAcpRolloverSelectable({ activePrompt: true, authRequired: false, live: true })).toBe(false);
    expect(isAcpRolloverSelectable({ activePrompt: false, authRequired: true, live: true })).toBe(false);
    expect(isAcpRolloverSelectable({ activePrompt: false, authRequired: false, live: false })).toBe(false);
  });
});

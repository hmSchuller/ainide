import { describe, expect, it } from "vitest";
import type { AcpServerEvent, AcpSession } from "@ainide/shared";
import { applyAcpServerEvent, emptyAcpClientState } from "./acp-state";

function session(id = "session-1"): AcpSession {
  return {
    id,
    title: id,
    titleSource: "user",
    projectId: "project-1",
    providerId: "fake",
    providerLabel: "Fake",
    authMethods: [],
    status: "live",
    capabilities: { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true },
    configOptions: [],
    availableCommands: [],
    pendingRequests: [],
    activePrompt: false,
    resumability: "non_resumable",
  };
}

describe("ACP client event state", () => {
  it("applies snapshots and coalesces ordered message chunks", () => {
    let state = applyAcpServerEvent(emptyAcpClientState(), { type: "snapshot", projectId: "project-1", sessions: [session()], history: {}, sequence: 0, sequences: { "session-1": 0 } });
    const message = (sequence: number, text: string): AcpServerEvent => ({ type: "session_event", projectId: "project-1", sessionId: "session-1", sequence, event: { type: "activity", sessionId: "session-1", activity: { type: "message", id: "message-1", role: "agent", text } } });
    state = applyAcpServerEvent(state, message(1, "hello "));
    state = applyAcpServerEvent(state, message(2, "world"));
    state = applyAcpServerEvent(state, message(2, "duplicate"));
    expect(state.history["session-1"]).toEqual([{ type: "message", id: "message-1", role: "agent", text: "hello world" }]);
  });

  it("retains explicit Markdown metadata and the complete streamed source", () => {
    let state = applyAcpServerEvent(emptyAcpClientState(), { type: "snapshot", projectId: "project-1", sessions: [session()], history: {}, sequence: 0, sequences: { "session-1": 0 } });
    const message = (sequence: number, text: string): AcpServerEvent => ({ type: "session_event", projectId: "project-1", sessionId: "session-1", sequence, event: { type: "activity", sessionId: "session-1", activity: { type: "message", id: "message-2", role: "user", format: "markdown", text } } });
    state = applyAcpServerEvent(state, message(1, "**streamed "));
    state = applyAcpServerEvent(state, message(2, "source**"));

    expect(state.history["session-1"]).toEqual([{ type: "message", id: "message-2", role: "user", format: "markdown", text: "**streamed source**" }]);
  });

  it("queues out-of-order events and ignores hidden-project events", () => {
    let state = applyAcpServerEvent(emptyAcpClientState(), { type: "snapshot", projectId: "project-1", sessions: [session()], history: {}, sequence: 0, sequences: { "session-1": 0 } });
    const status = (sequence: number, title: string): AcpServerEvent => ({ type: "session_event", projectId: "project-1", sessionId: "session-1", sequence, event: { type: "status", session: { ...session(), title } } });
    state = applyAcpServerEvent(state, status(2, "new"));
    expect(state.sessions[0]?.title).toBe("session-1");
    state = applyAcpServerEvent(state, status(1, "old"));
    expect(state.sessions[0]?.title).toBe("new");
    state = applyAcpServerEvent(state, { type: "session_event", projectId: "other", sessionId: "session-1", sequence: 3, event: { type: "status", session: { ...session(), title: "leak" } } });
    expect(state.sessions[0]?.title).toBe("new");
  });

  it("removes sessions and retained history", () => {
    let state = applyAcpServerEvent(emptyAcpClientState(), { type: "snapshot", projectId: "project-1", sessions: [session()], history: { "session-1": [{ type: "turn", status: "completed" }] }, sequence: 1, sequences: { "session-1": 1 } });
    state = applyAcpServerEvent(state, { type: "session_removed", projectId: "project-1", sessionId: "session-1", sequence: 2 });
    expect(state.sessions).toEqual([]);
    expect(state.history).toEqual({});
  });
});

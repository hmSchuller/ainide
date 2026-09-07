import type { AcpActivity, AcpServerEvent, AcpSession } from "@ainide/shared";
import { describe, expect, it } from "vitest";
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
    capabilities: { canCancel: true, canClose: false, canLoad: false, canList: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true },
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

  it("coalesces interleaved message and tool updates without reordering unknown activity", () => {
    let state = applyAcpServerEvent(emptyAcpClientState(), { type: "snapshot", projectId: "project-1", sessions: [session()], history: {}, sequence: 0, sequences: { "session-1": 0 } });
    const activity = (sequence: number, value: AcpActivity): AcpServerEvent => ({ type: "session_event", projectId: "project-1", sessionId: "session-1", sequence, event: { type: "activity", sessionId: "session-1", activity: value } });
    state = applyAcpServerEvent(state, activity(1, { type: "message", id: "message-1", role: "agent", text: "Hello" }));
    state = applyAcpServerEvent(state, activity(2, { type: "tool_call", id: "tool-1", title: "Read file", status: "running", input: "src/index.ts" }));
    state = applyAcpServerEvent(state, activity(3, { type: "unknown", name: "future_update", data: { source: "provider" } }));
    state = applyAcpServerEvent(state, activity(4, { type: "message", id: "message-1", role: "agent", text: " world" }));
    state = applyAcpServerEvent(state, activity(5, { type: "tool_call", id: "tool-1", title: "Read file", status: "completed", output: "contents" }));

    expect(state.history["session-1"]).toEqual([
      { type: "message", id: "message-1", role: "agent", text: "Hello world" },
      { type: "tool_call", id: "tool-1", title: "Read file", status: "completed", input: "src/index.ts", output: "contents" },
      { type: "unknown", name: "future_update", data: { source: "provider" } },
    ]);
  });

  it("keeps coalesced history bounded while retaining newest unrelated activity", () => {
    const retained: AcpActivity[] = [
      { type: "message", id: "message-1", role: "agent", text: "Hello" },
      ...Array.from({ length: 1_999 }, (_, index): AcpActivity => ({ type: "unknown", name: `unknown-${index}`, data: null })),
    ];
    let state = applyAcpServerEvent(emptyAcpClientState(), { type: "snapshot", projectId: "project-1", sessions: [session()], history: { "session-1": retained }, sequence: 0, sequences: { "session-1": 0 } });
    const activity = (sequence: number, value: AcpActivity): AcpServerEvent => ({ type: "session_event", projectId: "project-1", sessionId: "session-1", sequence, event: { type: "activity", sessionId: "session-1", activity: value } });
    state = applyAcpServerEvent(state, activity(1, { type: "message", id: "message-1", role: "agent", text: " world" }));
    expect(state.history["session-1"]).toHaveLength(2_000);
    expect(state.history["session-1"]?.[0]).toEqual({ type: "message", id: "message-1", role: "agent", text: "Hello world" });

    state = applyAcpServerEvent(state, activity(2, { type: "unknown", name: "newest", data: null }));
    expect(state.history["session-1"]).toHaveLength(2_000);
    expect(state.history["session-1"]?.at(-1)).toEqual({ type: "unknown", name: "newest", data: null });
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

  it("keeps provider-reported subordinate updates in the parent session", () => {
    let state = applyAcpServerEvent(emptyAcpClientState(), { type: "snapshot", projectId: "project-1", sessions: [session()], history: {}, sequence: 0, sequences: { "session-1": 0 } });
    state = applyAcpServerEvent(state, { type: "session_event", projectId: "project-1", sessionId: "session-1", sequence: 1, event: { type: "subagent", sessionId: "session-1", subagent: { providerId: "fake", id: "child-1", role: "scout", state: "running" } } });
    state = applyAcpServerEvent(state, { type: "session_event", projectId: "project-1", sessionId: "session-1", sequence: 2, event: { type: "subagent", sessionId: "session-1", subagent: { providerId: "fake", id: "child-2", name: "Builder", activity: "Writing", state: "completed" } } });
    state = applyAcpServerEvent(state, { type: "session_event", projectId: "project-1", sessionId: "session-1", sequence: 3, event: { type: "subagent", sessionId: "session-1", subagent: { providerId: "other", id: "child-1", state: "working" } } });
    expect(state.sessions[0]?.subagents).toEqual([
      { providerId: "fake", id: "child-1", role: "scout", state: "running" },
      { providerId: "fake", id: "child-2", name: "Builder", activity: "Writing", state: "completed" },
      { providerId: "other", id: "child-1", state: "working" },
    ]);
  });

  it("preserves provider subagents across reconnect and project snapshots without child sessions", () => {
    let state = applyAcpServerEvent(emptyAcpClientState(), {
      type: "snapshot",
      projectId: "project-1",
      sessions: [session("parent-1"), session("parent-2")],
      history: {},
      sequence: 0,
      sequences: { "parent-1": 0, "parent-2": 0 },
    });
    state = applyAcpServerEvent(state, {
      type: "session_event",
      projectId: "project-1",
      sessionId: "parent-1",
      sequence: 1,
      event: {
        type: "subagent",
        sessionId: "parent-1",
        subagent: { providerId: "fake", id: "provider-child-1" },
      },
    });

    expect(state.sessions.map((candidate) => candidate.id)).toEqual(["parent-1", "parent-2"]);
    expect(state.sessions[0]?.subagents).toEqual([{ providerId: "fake", id: "provider-child-1" }]);
    expect(state.sessions[1]?.subagents).toBeUndefined();

    state = applyAcpServerEvent(state, {
      type: "snapshot",
      projectId: "project-1",
      sessions: state.sessions,
      history: {},
      sequence: 0,
      sequences: { "parent-1": 1, "parent-2": 0 },
    });
    expect(state.sessions.map((candidate) => candidate.id)).toEqual(["parent-1", "parent-2"]);
    expect(state.sessions[0]?.subagents).toEqual([{ providerId: "fake", id: "provider-child-1" }]);
    expect(state.sessions[1]?.subagents).toBeUndefined();

    state = applyAcpServerEvent(state, {
      type: "snapshot",
      projectId: "project-2",
      sessions: [{ ...session("parent-3"), projectId: "project-2" }],
      history: {},
      sequence: 0,
      sequences: { "parent-3": 0 },
    });
    expect(state.projectId).toBe("project-2");
    expect(state.sessions.map((candidate) => candidate.id)).toEqual(["parent-3"]);
    expect(state.sessions[0]?.subagents).toBeUndefined();
    expect(state.sessions.map((candidate) => candidate.id)).not.toContain("provider-child-1");
  });

  it("removes sessions and retained history", () => {
    let state = applyAcpServerEvent(emptyAcpClientState(), { type: "snapshot", projectId: "project-1", sessions: [session()], history: { "session-1": [{ type: "turn", status: "completed" }] }, sequence: 1, sequences: { "session-1": 1 } });
    state = applyAcpServerEvent(state, { type: "session_removed", projectId: "project-1", sessionId: "session-1", sequence: 2 });
    expect(state.sessions).toEqual([]);
    expect(state.history).toEqual({});
  });
});

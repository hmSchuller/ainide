import * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { AcpEventLog, appendAcpActivity, normalizeConfigOptions, normalizeElicitationRequest, normalizePermissionRequest, normalizeSessionUpdate, stabilizeCursorMessageChunk } from "./normalize.js";

describe("ACP normalization", () => {
  it("normalizes provider configuration options, including boolean values", () => {
    expect(normalizeConfigOptions([
      { type: "select", id: "model", name: "Model", category: "model", currentValue: "fast", options: [{ value: "fast", name: "Fast" }] },
      { type: "boolean", id: "thinking", name: "Thinking", currentValue: true },
    ])).toEqual([
      { type: "select", id: "model", label: "Model", category: "model", currentValue: "fast", choices: [{ value: "fast", label: "Fast" }] },
      { type: "boolean", id: "thinking", label: "Thinking", currentValue: true },
    ]);
  });

  it("coalesces message chunks and retains tool activity and locations", () => {
    const first = normalizeSessionUpdate({ sessionUpdate: "agent_message_chunk", messageId: "message-1", content: { type: "text", text: "Hello" } });
    const second = normalizeSessionUpdate({ sessionUpdate: "agent_message_chunk", messageId: "message-1", content: { type: "text", text: " world" } });
    const history = first.activities.reduce((current, activity) => appendAcpActivity(current, activity), [] as typeof first.activities);
    const merged = second.activities.reduce((current, activity) => appendAcpActivity(current, activity), history);
    expect(merged).toEqual([{ type: "message", id: "message-1", role: "agent", text: "Hello world", format: "markdown" }]);

    const tool = normalizeSessionUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "tool-1",
      title: "Read file",
      status: "in_progress",
      locations: [{ path: "/tmp/project/src/index.ts", line: 4 }],
    });
    expect(tool.activities).toContainEqual({ type: "tool_call", id: "tool-1", title: "Read file", status: "running" });
    expect(tool.activities).toContainEqual({ type: "location", path: "/tmp/project/src/index.ts", line: 4 });
  });

  it("keeps unknown updates inspectable without carrying secret keys", () => {
    const result = normalizeSessionUpdate({ sessionUpdate: "future_update", token: "secret", reason: "diagnostic" } as unknown as acp.SessionUpdate);
    expect(result.activities).toEqual([{ type: "unknown", name: "future_update", data: { sessionUpdate: "future_update", reason: "diagnostic" } }]);
  });

  it("keeps only bounded, non-empty session titles", () => {
    expect(normalizeSessionUpdate({ sessionUpdate: "session_info_update", title: "  Generated title  " })).toEqual({ activities: [], title: "Generated title" });
    for (const title of ["", "  ", null, 42, { value: "invalid" }]) {
      expect(normalizeSessionUpdate({ sessionUpdate: "session_info_update", title } as unknown as acp.SessionUpdate)).toEqual({ activities: [] });
    }
    expect(normalizeSessionUpdate({ sessionUpdate: "session_info_update", title: "x".repeat(100) })).toEqual({ activities: [], title: "x".repeat(80) });
  });

  it("normalizes available commands without retaining the provider update as activity", () => {
    const update = {
      sessionUpdate: "available_commands_update",
      availableCommands: [
        { name: " plan ", description: " Create a plan ", input: { hint: "what to plan" } },
        { name: "plan", description: "Duplicate" },
        { name: "invalid", description: "" },
        { name: "future", description: "Future input", input: { type: "unsupported", hint: 42 } },
      ],
    } as unknown as acp.SessionUpdate;
    const result = normalizeSessionUpdate(update);
    expect(result.activities).toEqual([]);
    expect(result.availableCommands).toEqual([
      { name: "plan", description: "Create a plan", inputHint: "what to plan" },
      { name: "future", description: "Future input" },
    ]);
  });

  it("bounds command metadata and ignores malformed command entries", () => {
    const update = {
      sessionUpdate: "available_commands_update",
      availableCommands: [null, { name: "x".repeat(201), description: "too long name" }, { name: "large", description: "d".repeat(4_001), input: { hint: "h".repeat(501) } }],
    } as unknown as acp.SessionUpdate;
    const result = normalizeSessionUpdate(update);
    expect(result.availableCommands).toEqual([{ name: "large", description: `${"d".repeat(4_000 - "\n[truncated]".length)}\n[truncated]`, inputHint: `${"h".repeat(500 - "\n[truncated]".length)}\n[truncated]` }]);
  });

  it("adds a visible marker when retained activity payloads exceed the bound", () => {
    const result = normalizeSessionUpdate({ sessionUpdate: "agent_message_chunk", messageId: "large", content: { type: "text", text: "x".repeat(1_000_001) } });
    expect(result.activities[0]).toMatchObject({ type: "message", text: expect.stringContaining("[truncated]") });
  });

  it("stabilizes Cursor thought fragments so they render as one activity", () => {
    const first = normalizeSessionUpdate({ sessionUpdate: "agent_thought_chunk", messageId: "thought-1", content: { type: "text", text: "Planning" } }).activities[0];
    const second = normalizeSessionUpdate({ sessionUpdate: "agent_thought_chunk", messageId: "thought-2", content: { type: "text", text: " the change" } }).activities[0];
    if (first?.type !== "message" || second?.type !== "message") throw new Error("Expected message activities");
    expect(first).toMatchObject({ thought: true, format: "markdown" });
    const stable = stabilizeCursorMessageChunk([first], second);
    expect(stable).toMatchObject({ id: first.id, text: " the change", thought: true });
    expect(appendAcpActivity([first], stable)).toEqual([{ ...first, text: "Planning the change" }]);
  });

  it("assigns increasing replay sequence numbers and bounds retained events", () => {
    const log = new AcpEventLog(2);
    const first = log.append({ type: "activity", sessionId: "session", activity: { type: "usage", totalTokens: 1 } });
    const second = log.append({ type: "activity", sessionId: "session", activity: { type: "usage", totalTokens: 2 } });
    const third = log.append({ type: "activity", sessionId: "session", activity: { type: "usage", totalTokens: 3 } });
    expect([first.sequence, second.sequence, third.sequence]).toEqual([1, 2, 3]);
    expect(log.currentSequence).toBe(3);
    expect(log.history().map((entry) => entry.sequence)).toEqual([2, 3]);
  });

  it("normalizes permission and form elicitation requests", () => {
    const permission = normalizePermissionRequest({
      sessionId: "session",
      toolCall: { toolCallId: "tool", title: "Run tests" },
      options: [{ optionId: "once", name: "Allow once", kind: "allow_once" }],
    }, "request-1");
    expect(permission).toEqual({ type: "permission", request: { requestId: "request-1", title: "Run tests", options: [{ id: "once", label: "Allow once", kind: "allow_once" }] } });

    const elicitation = normalizeElicitationRequest({
      mode: "form",
      sessionId: "session",
      message: "Choose a mode",
      requestedSchema: { type: "object", properties: { mode: { type: "string", title: "Mode", enum: ["safe", "fast"] } }, required: ["mode"] },
    }, "request-2");
    expect(elicitation).toEqual({ type: "elicitation", request: {
      requestId: "request-2",
      title: "Choose a mode",
      fields: [{ id: "mode", label: "Mode", type: "text", required: true, choices: [{ value: "safe", label: "safe" }, { value: "fast", label: "fast" }] }],
    } });
  });
});

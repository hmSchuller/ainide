import { describe, expect, it } from "vitest";
import { projectAcpTurns } from "./acp-turns";

describe("ACP turn projections", () => {
  it("keeps a prompt, mixed activity, response, and completion in order", () => {
    const result = projectAcpTurns([
      { type: "message", id: "u", role: "user", text: "Fix it" },
      { type: "tool_call", id: "tool", title: "Read file", status: "running" },
      { type: "location", path: "src/app.ts", line: 2 },
      { type: "message", id: "a", role: "agent", text: "Working" },
      { type: "turn", status: "completed" },
    ]);
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]).toMatchObject({ classification: "turn", status: "completed", currentAction: "Running Read file", prompt: { text: "Fix it" }, finalResponse: { text: "Working" } });
    expect(result.turns[0]?.activities.map((activity) => activity.type)).toEqual(["message", "tool_call", "location", "message", "turn"]);
  });

  it("keeps replay bursts without a prompt visibly unclassified", () => {
    const result = projectAcpTurns([
      { type: "message", id: "old", role: "agent", text: "replayed" },
      { type: "unknown", name: "future_update", data: { safe: true } },
      { type: "turn", status: "completed" },
    ]);
    expect(result.turns[0]).toMatchObject({ classification: "legacy", status: "unclassified" });
    expect(result.turns[0]?.prompt).toBeUndefined();
    expect(result.turns[0]?.activities[1]).toMatchObject({ type: "unknown", name: "future_update" });
  });

  it("starts a new classified turn after an ambiguous replay group", () => {
    const result = projectAcpTurns([
      { type: "message", id: "old", role: "agent", text: "old replay" },
      { type: "message", id: "new", role: "user", text: "new prompt" },
    ]);
    expect(result.turns.map((turn) => turn.classification)).toEqual(["legacy", "turn"]);
    expect(result.turns[1]?.prompt?.text).toBe("new prompt");
  });

  it("bounds rendered turns and activity while retaining newest content", () => {
    const history = Array.from({ length: 5 }, (_, index) => ({ type: "message" as const, id: `u-${index}`, role: "user" as const, text: String(index) }));
    const result = projectAcpTurns(history, [], { maxTurns: 2, maxActivitiesPerTurn: 1 });
    expect(result.omittedTurns).toBe(3);
    expect(result.turns).toHaveLength(2);
  });

  it("attaches blocking requests only to the active prompt", () => {
    const request = { type: "permission" as const, request: { requestId: "request-1", title: "Run", options: [{ id: "once", label: "Once" }] } };
    const result = projectAcpTurns([{ type: "message", id: "u", role: "user", text: "Run" }], [request]);
    expect(result.turns[0]?.blockingRequest).toEqual(request);
  });
});

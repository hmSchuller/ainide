import { describe, expect, it } from "vitest";
import { captureInspectionReturn, clearInspectionReturn, getInspectionReturn, makeInspectionReturnLocation } from "./inspection-navigation";
import { modeUsesNumericShortcut, PRIMARY_MODE_LABELS, PRIMARY_MODES } from "./navigation";

describe("primary navigation", () => {
  it("presents modes in Edit, Review, Agents, and LazyGit order", () => {
    expect(PRIMARY_MODES).toEqual(["edit", "review", "agents", "lazygit"]);
    expect(PRIMARY_MODES.map((mode) => PRIMARY_MODE_LABELS[mode])).toEqual(["Edit", "Review", "Agents", "LazyGit"]);
  });

  it("does not advertise numeric shortcuts for mode changes", () => {
    for (const mode of PRIMARY_MODES) {
      expect(modeUsesNumericShortcut(mode)).toBe(false);
    }
  });

  it("retains project, session, turn/activity, scope, and conversation viewport for a diff return", () => {
    const location = makeInspectionReturnLocation({ projectId: "/repo", sessionId: "session-a", mode: "review", kind: "diff", reviewScope: "working-tree", turnId: "turn-user-1", activityId: "diff:diff-1", path: "src/app.ts", conversationScrollTop: 184 });
    captureInspectionReturn(location);
    expect(getInspectionReturn("/repo", "session-a")).toEqual({
      projectId: "/repo",
      sessionId: "session-a",
      turnId: "turn-user-1",
      activityId: "diff:diff-1",
      mode: "review",
      kind: "diff",
      reviewScope: "working-tree",
      conversation: { scrollTop: 184 },
      viewport: { path: "src/app.ts" },
    });
    expect(getInspectionReturn("/repo", "session-b")).toBeUndefined();
    clearInspectionReturn(location);
  });

  it("retains file return location and restores it by the originating session key", () => {
    const location = makeInspectionReturnLocation({ projectId: "/repo", sessionId: "session-file", mode: "agents", kind: "file", turnId: "turn-user-2", activityId: "location:src/app.ts:12:", path: "src/app.ts", line: 12, column: 4, paneId: "secondary", conversationScrollTop: 32 });
    captureInspectionReturn(location);
    expect(getInspectionReturn("/repo", "session-file")).toEqual(location);
    expect(getInspectionReturn("/other", "session-file")).toBeUndefined();
    clearInspectionReturn(location);
  });
});

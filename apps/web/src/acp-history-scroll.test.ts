import { describe, expect, it } from "vitest";
import { bottomDistance, initialAcpHistoryFollowState, isNearBottom, resumedAcpHistoryFollowState, stateAfterAcpHistoryActivity, stateAfterAcpHistoryScroll } from "./acp-history-scroll";

const atBottom = { scrollTop: 100, scrollHeight: 300, clientHeight: 200 };

describe("ACP history scroll policy", () => {
  it("calculates exact and tolerant bottom distances", () => {
    expect(bottomDistance(atBottom)).toBe(0);
    expect(isNearBottom({ ...atBottom, scrollTop: 96 })).toBe(true);
    expect(isNearBottom({ ...atBottom, scrollTop: 90 })).toBe(false);
  });

  it("starts following and follows activity at the bottom", () => {
    const initial = initialAcpHistoryFollowState();
    expect(stateAfterAcpHistoryActivity(initial)).toEqual({ state: initial, shouldScroll: true });
  });

  it("detaches without moving the viewport and exposes pending activity", () => {
    const detached = stateAfterAcpHistoryScroll({ ...atBottom, scrollTop: 40 }, initialAcpHistoryFollowState());
    expect(detached).toEqual({ following: false, hasNewActivity: false });
    expect(stateAfterAcpHistoryActivity(detached)).toEqual({ state: { following: false, hasNewActivity: true }, shouldScroll: false });
  });

  it("resumes following when the user reaches the bottom again", () => {
    const pending = { following: false, hasNewActivity: true };
    expect(stateAfterAcpHistoryScroll({ ...atBottom, scrollTop: 98 }, pending)).toEqual({ following: true, hasNewActivity: false });
    expect(resumedAcpHistoryFollowState()).toEqual({ following: true, hasNewActivity: false });
  });
});

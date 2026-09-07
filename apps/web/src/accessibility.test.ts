import { describe, expect, it } from "vitest";
import { announcementForNotice, boundedAnnouncement, isEditableTarget } from "./accessibility";

describe("accessible announcements", () => {
  it("bounds announcement text without exposing transcript content", () => {
    expect(boundedAnnouncement("  a   b ")).toBe("a b");
    expect(boundedAnnouncement("x".repeat(300))).toHaveLength(240);
  });

  it("announces session recovery notices but not ordinary feedback", () => {
    expect(announcementForNotice({ id: 1, tone: "error", text: "Provider connection failed" })).toEqual({ text: "Provider connection failed", assertive: true });
    expect(announcementForNotice({ id: 2, tone: "success", text: "Selection reference copied" })).toBeUndefined();
    expect(announcementForNotice({ id: 3, tone: "info", text: "Cancel turn requested" })?.assertive).toBe(false);
  });

  it("does not treat a non-browser test target as editable", () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});

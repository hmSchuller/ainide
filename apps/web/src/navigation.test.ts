import { describe, expect, it } from "vitest";
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
});

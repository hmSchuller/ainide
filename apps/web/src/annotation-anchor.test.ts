import { describe, expect, it } from "vitest";
import { anchorFromClientRect, centeredAnnotationDialog, positionAnnotationDialog } from "./annotation-anchor";

describe("annotation-anchor", () => {
  const viewport = { width: 1200, height: 800 };

  it("positions the dialog below the anchor when there is room", () => {
    const position = positionAnnotationDialog(
      { top: 100, left: 200, width: 80, height: 20 },
      { width: 300, height: 180 },
      10,
      viewport,
    );
    expect(position.top).toBe(130);
    expect(position.left).toBe(90);
  });

  it("flips the dialog above the anchor when it would overflow", () => {
    const position = positionAnnotationDialog(
      { top: viewport.height - 40, left: 120, width: 60, height: 18 },
      { width: 280, height: 200 },
      10,
      viewport,
    );
    expect(position.top).toBeLessThan(viewport.height - 40);
  });

  it("builds anchors from client rects", () => {
    expect(anchorFromClientRect({ top: 12, left: 34, width: 90, height: 22, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) })).toEqual({
      top: 12,
      left: 34,
      width: 90,
      height: 22,
    });
  });

  it("centers the dialog when no anchor is available", () => {
    const position = centeredAnnotationDialog({ width: 320, height: 200 }, 24, viewport);
    expect(position.left).toBe(440);
    expect(position.top).toBe(300);
  });
});

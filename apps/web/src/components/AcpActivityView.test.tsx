import type { AcpActivity } from "@ainide/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AcpActivityView } from "./AcpActivityView";

describe("AcpActivityView inspection actions", () => {
  it("offers the existing Review surface for a reported diff", () => {
    const activity: AcpActivity = { type: "diff", id: "diff-1", path: "src/app.ts", diff: "@@ -1 +1 @@\n-old\n+new" };
    const markup = renderToStaticMarkup(<AcpActivityView activity={activity} onOpenReference={() => undefined} onOpenDiff={() => undefined} />);
    expect(markup).toContain("src/app.ts");
    expect(markup).toContain("Open in Review");
    expect(markup).toContain('class="acp-unified-diff-line deletion"');
    expect(markup).toContain('class="acp-unified-diff-line addition"');
  });

  it("keeps thought content collapsed until the user expands it", () => {
    const activity: AcpActivity = { type: "message", id: "thought-1", role: "agent", thought: true, text: "*thinking*" };
    const markup = renderToStaticMarkup(<AcpActivityView activity={activity} onOpenReference={() => undefined} />);
    expect(markup).toContain('class="acp-stream-thought"');
    expect(markup).toContain("Thinking…");
    expect(markup).not.toContain("acp-stream-thought-body");
    expect(markup).not.toContain("<em>thinking</em>");
  });

  it("threads the rendered turn and activity identity through a file action", () => {
    const onOpenReference = vi.fn();
    const activity: AcpActivity = { type: "location", path: "src/app.ts", line: 7 };
    const element = AcpActivityView({ activity, onOpenReference, inspectionTarget: { turnId: "turn-user-1", activityId: "location:src/app.ts:7:" } });
    if (!element || typeof element !== "object" || !("props" in element) || typeof element.props.onClick !== "function") throw new Error("expected a location button");
    element.props.onClick();
    expect(onOpenReference).toHaveBeenCalledWith("src/app.ts", 7, undefined, { turnId: "turn-user-1", activityId: "location:src/app.ts:7:" });
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AcpTurnNarrative } from "./AcpTurnNarrative";

describe("AcpTurnNarrative", () => {
  it("puts prompt, action, response, and raw activity behind one turn", () => {
    const markup = renderToStaticMarkup(<AcpTurnNarrative history={[
      { type: "message", id: "u", role: "user", text: "Inspect **this**" },
      { type: "tool_call", id: "tool", title: "Read file", status: "running" },
      { type: "location", path: "src/app.ts", line: 2 },
      { type: "message", id: "a", role: "agent", text: "Done" },
      { type: "turn", status: "completed" },
    ]} pendingRequests={[]} onOpenReference={() => undefined} />);
    expect(markup).toContain("Prompt");
    expect(markup).toContain("Current action");
    expect(markup).toContain("Running Read file");
    expect(markup).toContain("Final response");
    expect(markup).toContain("Raw activity");
    expect(markup).toContain("src/app.ts");
    expect(markup).toContain('data-turn-id="turn-u"');
    expect(markup).toContain('data-activity-id="location:src/app.ts:2::1"');
  });

  it("labels ambiguous replay as unclassified and never invents an outcome", () => {
    const markup = renderToStaticMarkup(<AcpTurnNarrative history={[{ type: "message", id: "old", role: "agent", text: "replayed" }]} pendingRequests={[]} onOpenReference={() => undefined} />);
    expect(markup).toContain("Historical activity · unclassified");
    expect(markup).toContain("Unclassified activity");
  });
});

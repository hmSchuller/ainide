import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AcpConversationStream } from "./AcpConversationStream";

describe("AcpConversationStream", () => {
  it("renders mixed activity in chronological order without turn cards or raw disclosure", () => {
    const markup = renderToStaticMarkup(<AcpConversationStream history={[
      { type: "message", id: "u", role: "user", text: "Inspect **this**" },
      { type: "tool_call", id: "tool", title: "Read file", status: "running" },
      { type: "location", path: "src/app.ts", line: 2 },
      { type: "message", id: "a", role: "agent", text: "Done" },
      { type: "turn", status: "completed" },
    ]} pendingRequests={[]} onOpenReference={() => undefined} />);
    expect(markup).not.toContain("Prompt");
    expect(markup).not.toContain("Final response");
    expect(markup).not.toContain("Raw activity");
    expect(markup).not.toContain("acp-turn-card");
    expect(markup).toContain("Inspect");
    expect(markup).toContain("Read file");
    expect(markup).toContain("src/app.ts");
    expect(markup).toContain("Done");
    expect(markup).toContain('data-turn-id="turn-u"');
    expect(markup).toContain('data-activity-id="location:src/app.ts:2::1"');
    const userIndex = markup.indexOf("Inspect");
    const toolIndex = markup.indexOf("Read file");
    const agentIndex = markup.indexOf("Done");
    expect(userIndex).toBeLessThan(toolIndex);
    expect(toolIndex).toBeLessThan(agentIndex);
  });

  it("labels legacy replay bursts with a divider and keeps activity inspectable", () => {
    const markup = renderToStaticMarkup(<AcpConversationStream history={[{ type: "message", id: "old", role: "agent", text: "replayed" }]} pendingRequests={[]} onOpenReference={() => undefined} />);
    expect(markup).toContain("Earlier activity");
    expect(markup).toContain("replayed");
    expect(markup).not.toContain("Unclassified activity");
    expect(markup).not.toContain("Historical activity");
  });

  it("exposes tool payload only inside expanded details", () => {
    const markup = renderToStaticMarkup(<AcpConversationStream history={[
      { type: "message", id: "u", role: "user", text: "run" },
      { type: "tool_call", id: "tool", title: "Read file", status: "completed", input: "secret-input", output: "secret-output" },
    ]} pendingRequests={[]} onOpenReference={() => undefined} />);
    expect(markup).toContain("Read file");
    expect(markup).toContain("secret-input");
    expect(markup).toContain("secret-output");
    expect(markup).toContain("<details");
  });
});

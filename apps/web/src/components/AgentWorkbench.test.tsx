import { vi, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.hoisted(() => {
  if (!globalThis.localStorage) {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      },
    });
  }
});

vi.mock("./TerminalPanel", () => ({ TerminalView: () => null }));

import type { AcpActivity, AcpSession, TerminalSession } from "@ainide/shared";
import { useAppStore } from "../store";
import { ACP_SEND_LABEL } from "../acp-composer";
import { ActivityView, AgentWorkbench, combinedAgentEntries } from "./AgentWorkbench";

const capabilities = { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true };

describe("AgentWorkbench", () => {
  it("combines mixed PTY and ACP sessions only for the active project", () => {
    const pty: TerminalSession = { id: "pty", title: "PTY agent", command: "agent", cwd: "/project", alive: true, kind: "agent", projectId: "/project" };
     const acp: AcpSession = { id: "acp", title: "ACP agent", titleSource: "user", projectId: "/project", providerId: "fake", providerLabel: "Fake provider", authMethods: [], status: "live", capabilities, configOptions: [], availableCommands: [], pendingRequests: [], activePrompt: false, resumability: "non_resumable" };
     const pinned: AcpSession = { ...acp, id: "acp-pinned", title: "Pinned ACP agent" };
     const hidden: AcpSession = { ...acp, id: "hidden", projectId: "/other", title: "Hidden" };
    expect(combinedAgentEntries([pty], [acp, pinned, hidden], "/project")).toEqual([{ kind: "pty", session: pty }, { kind: "acp", session: acp }, { kind: "acp", session: pinned }]);
  });

  it("shows the Agents empty view when the active project has no retained agents", () => {
    useAppStore.setState({ activeProjectId: "/project", terminals: [], acpSessions: [], focusedSessionId: undefined, pinnedSessionId: undefined });
    const markup = renderToStaticMarkup(<AgentWorkbench onNewAgent={() => undefined} onOpenReference={() => undefined} />);
    expect(markup).toContain("NO AGENTS RUNNING");
    expect(markup).toContain("Start first agent");
  });

  it("does not show an agent retained by another project", () => {
    const hidden: TerminalSession = { id: "hidden", title: "Hidden", command: "agent", cwd: "/other", alive: true, kind: "agent", projectId: "/other" };
    expect(combinedAgentEntries([hidden], [], "/project")).toEqual([]);
  });

  it("renders unmarked user, agent, and thought messages through the shared Markdown surface", () => {
    const acp: AcpSession = { id: "acp-markdown", title: "Markdown", titleSource: "user", projectId: "/project", providerId: "fake", providerLabel: "Fake provider", authMethods: [], status: "live", capabilities, configOptions: [], availableCommands: [], pendingRequests: [], activePrompt: false, resumability: "non_resumable" };
    const history: AcpActivity[] = [
      { type: "message", id: "user-message", role: "user", text: "## User\n\n- keep **this** source" },
      { type: "message", id: "agent-message", role: "agent", text: "## Agent\n\n`ready`" },
      { type: "message", id: "thought-message", role: "agent", thought: true, text: "*thinking*" },
    ];
    useAppStore.setState({ activeProjectId: "/project", acpSessions: [acp], focusedSessionId: acp.id, pinnedSessionId: undefined, acpHistory: { [acp.id]: history } });

    const markup = renderToStaticMarkup(<>{history.map((activity, index) => <ActivityView activity={activity} onOpenReference={() => undefined} key={index} />)}</>);

    expect(markup).toContain('class="acp-message user"');
    expect(markup).toContain('class="acp-message agent"');
    expect(markup).toContain("<h2>User</h2>");
    expect(markup).toContain("<h2>Agent</h2>");
    expect(markup).toContain("<strong>this</strong>");
    expect(markup).toContain("<code>ready</code>");
    expect(markup).toContain('class="acp-thought"');
    expect(markup).toContain("<em>thinking</em>");
    expect(markup).not.toContain("dangerouslySetInnerHTML");
  });

  it("keeps non-message activities on their existing renderers in a mixed history", () => {
    const acp: AcpSession = { id: "acp-mixed", title: "Mixed", titleSource: "user", projectId: "/project", providerId: "fake", providerLabel: "Fake provider", authMethods: [], status: "live", capabilities, configOptions: [], availableCommands: [], pendingRequests: [], activePrompt: false, resumability: "non_resumable" };
    const history: AcpActivity[] = [
      { type: "message", id: "message", role: "agent", text: "message" },
      { type: "plan", id: "plan", text: "[pending] inspect", status: "running" },
      { type: "tool_call", id: "tool", title: "Read", status: "completed", input: "input", output: "output" },
      { type: "location", path: "src/app.ts", line: 3 },
      { type: "diff", id: "diff", path: "src/app.ts", diff: "diff text" },
      { type: "terminal", id: "terminal", output: "terminal text" },
      { type: "usage", totalTokens: 12 },
      { type: "turn", status: "completed", message: "finished" },
      { type: "unknown", name: "future", data: { value: "unknown" } },
    ];
    useAppStore.setState({ activeProjectId: "/project", acpSessions: [acp], focusedSessionId: acp.id, pinnedSessionId: undefined, acpHistory: { [acp.id]: history } });

    const markup = renderToStaticMarkup(<>{history.map((activity, index) => <ActivityView activity={activity} onOpenReference={() => undefined} key={index} />)}</>);

    expect(markup).toContain('class="acp-plan"');
    expect(markup).toContain('class="acp-tool completed"');
    expect(markup).toContain('class="acp-location"');
    expect(markup).toContain('class="acp-diff"');
    expect(markup).toContain('class="acp-terminal-activity"');
    expect(markup).toContain("Usage: 12 tokens");
    expect(markup).toContain('class="acp-turn completed"');
    expect(markup).toContain('class="acp-unknown"');
    expect(markup).toContain("<pre>input</pre>");
    expect(markup).toContain("<pre>terminal text</pre>");
  });

  it("advertises Enter as the primary ACP send shortcut", () => {
    expect(ACP_SEND_LABEL).toBe("Send Enter");
  });

});

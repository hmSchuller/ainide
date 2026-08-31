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

import type { AcpSession, TerminalSession } from "@ainide/shared";
import { useAppStore } from "../store";
import { ACP_SEND_LABEL } from "../acp-composer";
import { AgentWorkbench, combinedAgentEntries } from "./AgentWorkbench";

const capabilities = { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true };

describe("AgentWorkbench", () => {
  it("combines mixed PTY and ACP sessions only for the active project", () => {
    const pty: TerminalSession = { id: "pty", title: "PTY agent", command: "agent", cwd: "/project", alive: true, kind: "agent", projectId: "/project" };
     const acp: AcpSession = { id: "acp", title: "ACP agent", titleSource: "user", projectId: "/project", providerId: "fake", providerLabel: "Fake provider", authMethods: [], status: "live", capabilities, configOptions: [], availableCommands: [], pendingRequests: [], activePrompt: false, resumability: "non_resumable" };
    const hidden: AcpSession = { ...acp, id: "hidden", projectId: "/other", title: "Hidden" };
    expect(combinedAgentEntries([pty], [acp, hidden], "/project")).toEqual([{ kind: "pty", session: pty }, { kind: "acp", session: acp }]);
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

  it("advertises Enter as the primary ACP send shortcut", () => {
    expect(ACP_SEND_LABEL).toBe("Send Enter");
  });

});

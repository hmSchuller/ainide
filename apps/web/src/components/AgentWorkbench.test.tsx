import { vi, describe, expect, it } from "vitest";

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
import { combinedAgentEntries } from "./AgentWorkbench";

const capabilities = { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true };

describe("AgentWorkbench", () => {
  it("combines mixed PTY and ACP sessions only for the active project", () => {
    const pty: TerminalSession = { id: "pty", title: "PTY agent", command: "agent", cwd: "/project", alive: true, kind: "agent", projectId: "/project" };
    const acp: AcpSession = { id: "acp", title: "ACP agent", projectId: "/project", providerId: "fake", providerLabel: "Fake provider", authMethods: [], status: "live", capabilities, configOptions: [], pendingRequests: [], activePrompt: false, resumability: "non_resumable" };
    const hidden: AcpSession = { ...acp, id: "hidden", projectId: "/other", title: "Hidden" };
    expect(combinedAgentEntries([pty], [acp, hidden], "/project")).toEqual([{ kind: "pty", session: pty }, { kind: "acp", session: acp }]);
  });
});

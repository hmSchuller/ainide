import { describe, expect, it } from "vitest";
import { DEFAULT_TERMINAL_KINDS, missingTerminalKinds, type TerminalSession } from "@ainide/shared";
import { agentTerminals, lazygitTerminals, selectLazygitSession, shouldStartLazygitSession, utilityTerminals } from "./terminal-ownership";

function session(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: "one",
    title: "Session",
    command: "sh",
    cwd: "/proj-a",
    alive: true,
    kind: "shell",
    projectId: "/proj-a",
    ...overrides,
  };
}

describe("terminal ownership", () => {
  it("limits utility tabs to shell, custom, and build sessions", () => {
    const terminals = [
      session({ id: "shell", kind: "shell" }),
      session({ id: "custom", kind: "custom" }),
      session({ id: "build", kind: "build" }),
      session({ id: "lazygit", kind: "lazygit" }),
      session({ id: "agent", kind: "agent" }),
    ];
    expect(utilityTerminals(terminals, "/proj-a").map((item) => item.id)).toEqual(["shell", "custom", "build"]);
  });

  it("keeps build utility sessions scoped to their project", () => {
    const terminals = [
      session({ id: "build-a", kind: "build", projectId: "/proj-a" }),
      session({ id: "build-b", kind: "build", projectId: "/proj-b" }),
      session({ id: "shell", kind: "shell", projectId: "/proj-other" }),
    ];
    expect(utilityTerminals(terminals, "/proj-a").map((item) => item.id)).toEqual(["build-a"]);
  });

  it("keeps Lazygit sessions for the dedicated mode only", () => {
    const terminals = [
      session({ id: "lazy-a", kind: "lazygit", projectId: "/proj-a" }),
      session({ id: "lazy-b", kind: "lazygit", projectId: "/proj-b" }),
      session({ id: "shell", kind: "shell" }),
    ];
    expect(lazygitTerminals(terminals, "/proj-a").map((item) => item.id)).toEqual(["lazy-a"]);
  });

  it("keeps Agents limited to agent sessions", () => {
    const terminals = [
      session({ id: "agent", kind: "agent" }),
      session({ id: "shell", kind: "shell" }),
      session({ id: "lazygit", kind: "lazygit" }),
    ];
    expect(agentTerminals(terminals, "/proj-a").map((item) => item.id)).toEqual(["agent"]);
  });

  it("does not include agent PTYs in project startup reconciliation", () => {
    expect(missingTerminalKinds([], DEFAULT_TERMINAL_KINDS)).toEqual(["shell", "lazygit"]);
    expect(missingTerminalKinds([session({ kind: "agent" })], DEFAULT_TERMINAL_KINDS)).toEqual(["shell", "lazygit"]);
  });

  it("reuses an existing Lazygit session instead of starting another", () => {
    const terminals = [
      session({ id: "dead", kind: "lazygit", alive: false }),
      session({ id: "live", kind: "lazygit", alive: true }),
    ];
    expect(shouldStartLazygitSession(lazygitTerminals(terminals, "/proj-a"))).toBe(false);
    expect(selectLazygitSession(lazygitTerminals(terminals, "/proj-a"))?.id).toBe("live");
    expect(selectLazygitSession(lazygitTerminals(terminals, "/proj-a"), "dead")?.id).toBe("dead");
  });
});

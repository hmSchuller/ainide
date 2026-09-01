import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    },
  });
});

import { TERMINAL_COLLAPSED_KEY } from "./layout-prefs";
import { findPaneForPath, useAppStore } from "./store";

describe("store tab rename", () => {
  beforeEach(() => {
    useAppStore.setState({
      tabs: [{ path: "src/old.ts", name: "old.ts", content: "a", savedContent: "a", language: "typescript" }],
      panes: {
        primary: { tabPaths: ["src/old.ts"], activePath: "src/old.ts" },
        secondary: { tabPaths: [], activePath: undefined },
      },
      secondaryOpen: false,
      focusedPaneId: "primary",
    });
  });

  it("updates tab paths and pane state when a file is renamed", () => {
    useAppStore.getState().renameTabPath("src/old.ts", "src/new.ts");
    const state = useAppStore.getState();
    expect(state.tabs[0]?.path).toBe("src/new.ts");
    expect(state.panes.primary.tabPaths).toEqual(["src/new.ts"]);
    expect(state.panes.primary.activePath).toBe("src/new.ts");
    expect(findPaneForPath(state.panes, "src/new.ts")).toBe("primary");
  });

  it("updates language across Swift and Kotlin renames without disturbing the open buffer", () => {
    useAppStore.setState({
      tabs: [{ path: "src/old.txt", name: "old.txt", content: "unsaved", savedContent: "saved", language: "plaintext", conflict: { externalContent: "external" } }],
      panes: {
        primary: { tabPaths: [], activePath: undefined },
        secondary: { tabPaths: ["src/old.txt"], activePath: "src/old.txt" },
      },
      secondaryOpen: true,
      focusedPaneId: "secondary",
    });

    const expectOpenTab = (path: string, languageId: string) => {
      const state = useAppStore.getState();
      expect(state.tabs).toEqual([{ path, name: path.split("/").pop(), content: "unsaved", savedContent: "saved", language: languageId, conflict: { externalContent: "external" } }]);
      expect(state.panes).toEqual({
        primary: { tabPaths: [], activePath: undefined },
        secondary: { tabPaths: [path], activePath: path },
      });
    };

    useAppStore.getState().renameTabPath("src/old.txt", "src/App.swift");
    expectOpenTab("src/App.swift", "swift");
    useAppStore.getState().renameTabPath("src/App.swift", "src/Main.kt");
    expectOpenTab("src/Main.kt", "kotlin");
    useAppStore.getState().renameTabPath("src/Main.kt", "src/build.gradle.kts");
    expectOpenTab("src/build.gradle.kts", "kotlin");
    useAppStore.getState().renameTabPath("src/build.gradle.kts", "src/notes.txt");
    expectOpenTab("src/notes.txt", "plaintext");
  });
});

describe("terminal panel state", () => {
  beforeEach(() => {
    localStorage.setItem(TERMINAL_COLLAPSED_KEY, "true");
    useAppStore.setState({ terminalCollapsed: true, terminalMaximized: false });
  });

  it("forces expansion when maximizing and preserves it when restoring", () => {
    useAppStore.getState().setTerminalMaximized(true);
    expect(useAppStore.getState().terminalCollapsed).toBe(false);
    expect(localStorage.getItem(TERMINAL_COLLAPSED_KEY)).toBe("false");

    useAppStore.getState().setTerminalMaximized(false);

    const state = useAppStore.getState();
    expect(state.terminalMaximized).toBe(false);
    expect(state.terminalCollapsed).toBe(false);
    expect(localStorage.getItem(TERMINAL_COLLAPSED_KEY)).toBe("false");
  });

  it("persists expanding and collapsing the terminal panel", () => {
    useAppStore.getState().setTerminalCollapsed(false);
    expect(useAppStore.getState().terminalCollapsed).toBe(false);
    expect(localStorage.getItem(TERMINAL_COLLAPSED_KEY)).toBe("false");

    useAppStore.getState().setTerminalCollapsed(true);
    expect(useAppStore.getState().terminalCollapsed).toBe(true);
    expect(localStorage.getItem(TERMINAL_COLLAPSED_KEY)).toBe("true");
  });

  it("persists collapse after maximizing and restoring the panel", () => {
    useAppStore.getState().setTerminalMaximized(true);
    expect(useAppStore.getState().terminalCollapsed).toBe(false);
    expect(localStorage.getItem(TERMINAL_COLLAPSED_KEY)).toBe("false");

    useAppStore.getState().setTerminalMaximized(false);
    expect(useAppStore.getState().terminalCollapsed).toBe(false);

    useAppStore.getState().setTerminalCollapsed(true);
    expect(useAppStore.getState().terminalCollapsed).toBe(true);
    expect(localStorage.getItem(TERMINAL_COLLAPSED_KEY)).toBe("true");
  });

  it("keeps a maximized panel collapsed when cleanup runs before collapse", () => {
    useAppStore.getState().setTerminalMaximized(true);
    useAppStore.getState().setTerminalMaximized(false);
    useAppStore.getState().setTerminalCollapsed(true);

    const state = useAppStore.getState();
    expect(state.terminalMaximized).toBe(false);
    expect(state.terminalCollapsed).toBe(true);
    expect(localStorage.getItem(TERMINAL_COLLAPSED_KEY)).toBe("true");
  });

  it("preserves the collapse state and preference when clearing maximized state", () => {
    localStorage.setItem(TERMINAL_COLLAPSED_KEY, "true");
    useAppStore.setState({ terminalCollapsed: true, terminalMaximized: true });

    useAppStore.getState().setTerminalMaximized(false);

    const state = useAppStore.getState();
    expect(state.terminalMaximized).toBe(false);
    expect(state.terminalCollapsed).toBe(true);
    expect(localStorage.getItem(TERMINAL_COLLAPSED_KEY)).toBe("true");
  });
});

describe("combined agent state", () => {
  it("preserves independent ACP and PTY selections when either list changes", () => {
    useAppStore.setState({
      activeProjectId: "/project",
      terminals: [{ id: "pty-agent", title: "PTY", command: "agent", cwd: "/project", alive: true, kind: "agent", projectId: "/project" }],
      acpSessions: [{
        id: "acp-agent",
        title: "ACP",
        titleSource: "user",
        projectId: "/project",
        providerId: "fake",
        providerLabel: "Fake",
        authMethods: [],
        status: "live",
        capabilities: { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true },
        configOptions: [],
        availableCommands: [],
        pendingRequests: [],
        activePrompt: false,
        resumability: "non_resumable",
      }],
      focusedSessionId: "acp-agent",
      referenceTargetId: "acp-agent",
    });

    useAppStore.getState().setTerminals(useAppStore.getState().terminals);
    expect(useAppStore.getState().focusedSessionId).toBe("acp-agent");
    expect(useAppStore.getState().referenceTargetId).toBe("acp-agent");
    useAppStore.getState().setAcpSessions([]);
    expect(useAppStore.getState().focusedSessionId).toBe("pty-agent");
    expect(useAppStore.getState().referenceTargetId).toBeUndefined();
  });

  it("filters ACP bootstrap data to the active project and resets replay state on switch", () => {
    useAppStore.setState({ activeProjectId: "/project-a", acpHistory: { old: [{ type: "turn", status: "completed" }] }, acpSequences: { old: 4 }, acpQueued: {} });
    useAppStore.getState().setAcpSessions([
       { id: "a", title: "A", titleSource: "user", projectId: "/project-a", providerId: "fake", providerLabel: "Fake", authMethods: [], status: "live", capabilities: { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true }, configOptions: [], availableCommands: [], pendingRequests: [], activePrompt: false, resumability: "non_resumable" },
       { id: "b", title: "B", titleSource: "user", projectId: "/project-b", providerId: "fake", providerLabel: "Fake", authMethods: [], status: "live", capabilities: { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true }, configOptions: [], availableCommands: [], pendingRequests: [], activePrompt: false, resumability: "non_resumable" },
    ]);
    expect(useAppStore.getState().acpSessions.map((session) => session.id)).toEqual(["a"]);
    useAppStore.getState().setProjectSession({ activeProjectId: "/project-b", openProjects: [], knownProjects: [] });
    expect(useAppStore.getState().acpHistory).toEqual({});
    expect(useAppStore.getState().acpSequences).toEqual({});
  });

  it("does not duplicate or overwrite a session observed before its create response", () => {
    const commands = [{ name: "review", description: "Review changes" }];
    const session = {
      id: "race-session",
       title: "Generated by provider",
       titleSource: "provider" as const,
      projectId: "/project-a",
      providerId: "fake",
      providerLabel: "Fake",
      authMethods: [],
      status: "live" as const,
      capabilities: { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true },
      configOptions: [],
      availableCommands: commands,
      pendingRequests: [],
      activePrompt: false,
      resumability: "non_resumable" as const,
    };
    useAppStore.setState({ activeProjectId: "/project-a", acpSessions: [session] });
     useAppStore.getState().addAcpSession({ ...session, title: "Fake provider", availableCommands: [] });
    expect(useAppStore.getState().acpSessions).toEqual([session]);
  });
});

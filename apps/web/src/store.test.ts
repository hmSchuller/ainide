import type { GitFileComparison } from "@ainide/shared";
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

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getAcpProviderSessions: vi.fn(),
}));

import { getAcpProviderSessions } from "./api";
import { TERMINAL_COLLAPSED_KEY } from "./layout-prefs";
import { findPaneForPath, gitComparisonKey, recentSessionsState, useAppStore } from "./store";

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

  it("preserves explorer state across Review mode round-trips", () => {
    const directories = { "": { entries: [], loading: false } };
    useAppStore.setState({
      mode: "edit",
      explorerWidth: 312,
      directories,
      expanded: { "": true, src: true },
      selectedPath: "src/app.ts",
    });

    useAppStore.getState().setMode("review");
    useAppStore.getState().setMode("agents");
    const state = useAppStore.getState();
    expect(state.explorerWidth).toBe(312);
    expect(state.directories).toBe(directories);
    expect(state.expanded).toEqual({ "": true, src: true });
    expect(state.selectedPath).toBe("src/app.ts");
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
        capabilities: { canCancel: true, canClose: false, canLoad: false, canList: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true },
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
       { id: "a", title: "A", titleSource: "user", projectId: "/project-a", providerId: "fake", providerLabel: "Fake", authMethods: [], status: "live", capabilities: { canCancel: true, canClose: false, canLoad: false, canList: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true }, configOptions: [], availableCommands: [], pendingRequests: [], activePrompt: false, resumability: "non_resumable" },
       { id: "b", title: "B", titleSource: "user", projectId: "/project-b", providerId: "fake", providerLabel: "Fake", authMethods: [], status: "live", capabilities: { canCancel: true, canClose: false, canLoad: false, canList: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true }, configOptions: [], availableCommands: [], pendingRequests: [], activePrompt: false, resumability: "non_resumable" },
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
      capabilities: { canCancel: true, canClose: false, canLoad: false, canList: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true },
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

function comparison(overrides: Partial<GitFileComparison> = {}): GitFileComparison {
  return {
    path: "src/a.ts",
    status: "modified",
    baseline: "head",
    head: "head-a",
    branch: "main",
    isRepository: true,
    content: "baseline",
    ...overrides,
  };
}

describe("transient Git comparison state", () => {
  beforeEach(() => {
    useAppStore.setState({ token: "token-a", activeProjectId: "project-a", gitComparisons: {} });
  });

  it("stores ready and unavailable results under the project, path, and HEAD key", () => {
    const readyRequest = useAppStore.getState().beginGitComparison({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a" });
    expect(readyRequest).toBeDefined();
    useAppStore.getState().setGitComparisonResult({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a", requestId: readyRequest!, comparison: comparison() });

    const unavailableRequest = useAppStore.getState().beginGitComparison({ projectId: "project-a", path: "image.png", head: "head-a", token: "token-a" });
    useAppStore.getState().setGitComparisonResult({ projectId: "project-a", path: "image.png", head: "head-a", token: "token-a", requestId: unavailableRequest!, comparison: comparison({ path: "image.png", status: "modified", baseline: "unavailable", unavailableReason: "binary", content: undefined }) });
    const errorRequest = useAppStore.getState().beginGitComparison({ projectId: "project-a", path: "notes.md", head: "head-a", token: "token-a" });
    useAppStore.getState().setGitComparisonError({ projectId: "project-a", path: "notes.md", head: "head-a", token: "token-a", requestId: errorRequest!, message: "Comparison failed" });

    const state = useAppStore.getState().gitComparisons;
    expect(state[gitComparisonKey("project-a", "src/a.ts", "head-a")]).toMatchObject({ status: "ready", comparable: true });
    expect(state[gitComparisonKey("project-a", "image.png", "head-a")]).toMatchObject({ status: "unavailable", comparable: false, reason: "binary" });
    expect(state[gitComparisonKey("project-a", "notes.md", "head-a")]).toMatchObject({ status: "error", message: "Comparison failed" });
  });

  it("clears state on project switch and ignores a response from the previous project", () => {
    const requestId = useAppStore.getState().beginGitComparison({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a" });
    useAppStore.getState().setProjectSession({ activeProjectId: "project-b", openProjects: [], knownProjects: [] });
    useAppStore.getState().setGitComparisonResult({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a", requestId: requestId!, comparison: comparison() });

    expect(useAppStore.getState().gitComparisons).toEqual({});
  });

  it("invalidates old HEAD entries and rejects their late response", () => {
    const requestId = useAppStore.getState().beginGitComparison({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a" });
    useAppStore.getState().invalidateGitComparisons("project-a", "head-b");
    useAppStore.getState().setGitComparisonResult({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a", requestId: requestId!, comparison: comparison() });

    expect(useAppStore.getState().gitComparisons).toEqual({});
  });

  it("rejects obsolete request and token results", () => {
    const first = useAppStore.getState().beginGitComparison({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a" });
    const second = useAppStore.getState().beginGitComparison({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a" });
    useAppStore.getState().setGitComparisonResult({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a", requestId: first!, comparison: comparison({ content: "obsolete" }) });
    expect(useAppStore.getState().gitComparisons[gitComparisonKey("project-a", "src/a.ts", "head-a")]).toMatchObject({ status: "loading", requestId: second });

    useAppStore.getState().setToken("token-b");
    useAppStore.getState().setGitComparisonError({ projectId: "project-a", path: "src/a.ts", head: "head-a", token: "token-a", requestId: second!, message: "obsolete" });
    expect(useAppStore.getState().gitComparisons).toEqual({});
  });
});

const capabilities = { canCancel: true, canClose: false, canLoad: true, canList: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true };

function resumedSession(id: string, overrides: Record<string, unknown> = {}): {
  id: string;
  title: string;
  titleSource: "provider";
  projectId: string;
  providerId: string;
  providerLabel: string;
  authMethods: never[];
  status: "live";
  capabilities: typeof capabilities;
  configOptions: never[];
  availableCommands: never[];
  pendingRequests: never[];
  activePrompt: boolean;
  resumability: "resumable";
  [key: string]: unknown;
} {
  const { id: idOverride, ...rest } = overrides as Record<string, unknown> & { id?: string };
  return {
    id: (idOverride as string) ?? id,
    title: "Resumed context",
    titleSource: "provider",
    projectId: "/project-a",
    providerId: "fake",
    providerLabel: "Fake provider",
    authMethods: [],
    status: "live",
    capabilities,
    configOptions: [],
    availableCommands: [],
    pendingRequests: [],
    activePrompt: false,
    resumability: "resumable",
    ...rest,
  };
}

describe("recent provider sessions", () => {
  beforeEach(() => {
    vi.mocked(getAcpProviderSessions).mockReset();
    useAppStore.setState({ token: "token-1", activeProjectId: "/project-a", recentAcpSessions: {} });
  });

  it("moves through loading into an available result", async () => {
    vi.mocked(getAcpProviderSessions).mockResolvedValueOnce({ available: true, sessions: [{ sessionId: "s-1", title: "Prior context", updatedAt: "2026-02-01T00:00:00.000Z" }] });
    const fetch = useAppStore.getState().fetchAcpProviderSessions("fake");
    expect(useAppStore.getState().recentAcpSessions.fake).toEqual({ status: "loading", sessions: [] });
    await fetch;
    expect(useAppStore.getState().recentAcpSessions.fake).toEqual({ status: "available", sessions: [{ sessionId: "s-1", title: "Prior context", updatedAt: "2026-02-01T00:00:00.000Z" }] });
  });

  it("maps an empty listing to the muted empty state", async () => {
    vi.mocked(getAcpProviderSessions).mockResolvedValueOnce({ available: true, sessions: [] });
    await useAppStore.getState().fetchAcpProviderSessions("fake");
    expect(useAppStore.getState().recentAcpSessions.fake).toEqual({ status: "empty", sessions: [] });
  });

  it("marks unlisting providers and request failures as unavailable", async () => {
    vi.mocked(getAcpProviderSessions).mockResolvedValueOnce({ available: false, sessions: [] });
    await useAppStore.getState().fetchAcpProviderSessions("fake");
    expect(useAppStore.getState().recentAcpSessions.fake).toEqual({ status: "unavailable", sessions: [] });

    vi.mocked(getAcpProviderSessions).mockRejectedValueOnce(new Error("Boom"));
    await useAppStore.getState().fetchAcpProviderSessions("fake");
    expect(useAppStore.getState().recentAcpSessions.fake).toEqual({ status: "unavailable", sessions: [] });
  });

  it("clears recent sessions on project switch and drops a stale response", async () => {
    useAppStore.setState({ recentAcpSessions: { fake: { status: "available", sessions: [{ sessionId: "s-1" }] } } });
    let resolveStale: (value: { available: boolean; sessions: [] }) => void = () => undefined;
    vi.mocked(getAcpProviderSessions).mockReturnValueOnce(new Promise((resolve) => { resolveStale = resolve; }));
    const pending = useAppStore.getState().fetchAcpProviderSessions("fake");
    useAppStore.getState().setProjectSession({ activeProjectId: "/project-b", openProjects: [], knownProjects: [] });
    expect(useAppStore.getState().recentAcpSessions).toEqual({});
    resolveStale({ available: true, sessions: [] });
    await pending;
    expect(useAppStore.getState().recentAcpSessions).toEqual({});
  });
});

describe("session rollover adoption", () => {
  beforeEach(() => {
    useAppStore.setState({ activeProjectId: "/project-a", acpSessions: [], acpHistory: {} });
  });

  it("updates a rolled-over session in place and clears its local history", () => {
    const session = resumedSession("rollover-target");
    useAppStore.setState({ acpSessions: [session], acpHistory: { "rollover-target": [{ type: "turn", status: "completed" }] } });
    useAppStore.getState().applyAcpRollover({ ...session, title: "Fake provider", acpSessionId: "provider-session-2" });
    expect(useAppStore.getState().acpSessions).toEqual([{ ...session, title: "Fake provider", acpSessionId: "provider-session-2" }]);
    expect(useAppStore.getState().acpHistory["rollover-target"]).toBeUndefined();
  });

  it("ignores rollover updates for sessions it does not hold", () => {
    const rolled = resumedSession("foreign-session", { projectId: "/project-a" });
    useAppStore.setState({ acpSessions: [], acpHistory: {} });
    useAppStore.getState().applyAcpRollover(rolled);
    expect(useAppStore.getState().acpSessions).toEqual([]);
  });
});

describe("resuming a recent session", () => {
  beforeEach(() => {
    useAppStore.setState({ activeProjectId: "/project-a", acpSessions: [], focusedSessionId: undefined });
  });

  it("keeps one workbench entry and focuses the returned session when resuming a live session", () => {
    const live = resumedSession("existing-session");
    useAppStore.setState({ acpSessions: [live] });
    // The server returns the already-live session for the resumed provider session id.
    useAppStore.getState().addAcpSession({ ...live, title: "Resumed context" });
    useAppStore.getState().setFocusedSession(live.id);
    expect(useAppStore.getState().acpSessions).toHaveLength(1);
    expect(useAppStore.getState().acpSessions[0]?.title).toBe("Resumed context");
    expect(useAppStore.getState().focusedSessionId).toBe("existing-session");
  });

  it("adopts a freshly resumed session and focuses it without duplicate entries", () => {
    const created = resumedSession("new-session");
    useAppStore.getState().setFocusedSession(created.id);
    useAppStore.getState().addAcpSession(created);
    expect(useAppStore.getState().acpSessions.map((session) => session.id)).toEqual(["new-session"]);
    expect(useAppStore.getState().focusedSessionId).toBe("new-session");
    // A repeated create response for the same session never grows the workbench,
    // and merges never clobber the entry the browser already observed.
    useAppStore.getState().addAcpSession(resumedSession("new-session", { title: "Provider title" }));
    expect(useAppStore.getState().acpSessions).toHaveLength(1);
    expect(useAppStore.getState().acpSessions[0]?.title).toBe("Resumed context");
    expect(useAppStore.getState().focusedSessionId).toBe("new-session");
  });
});

describe("recent sessions state mapping", () => {
  it("normalizes results into the four picker states", () => {
    expect(recentSessionsState({ status: "loading" })).toEqual({ status: "loading", sessions: [] });
    expect(recentSessionsState({ status: "available", sessions: [{ sessionId: "s-1" }] })).toEqual({ status: "available", sessions: [{ sessionId: "s-1" }] });
    expect(recentSessionsState({ status: "available", sessions: [] })).toEqual({ status: "empty", sessions: [] });
    expect(recentSessionsState({ status: "empty" })).toEqual({ status: "empty", sessions: [] });
    expect(recentSessionsState({ status: "unavailable" })).toEqual({ status: "unavailable", sessions: [] });
  });
});

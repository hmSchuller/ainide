import { useEffect, useMemo, useRef, useState } from "react";
import type { AcpSession, FileEntry, GitStatus, ProjectSessionSnapshot, TerminalSession, Workspace } from "@ainide/shared";
import { missingTerminalKinds } from "@ainide/shared";
import { acpEventsUrl, closeProject, createAcpSession, createPath, createTerminal, deleteFile, getAcpProviders, getGitStatus, getReviewStatus, getSession, getTerminals, listFiles, openProject, parseAcpEvent, parseEvent, readFile, renameFile, saveProjectSnapshot, searchFiles, startReview, switchProject, writeFile, websocketUrl, type ProjectMutationResponse } from "./api";
import { EditorSurface, language } from "./components/Editor";
import { Explorer } from "./components/Explorer";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { ReviewSurface } from "./components/ReviewSurface";
import { TerminalPanel } from "./components/TerminalPanel";
import { AgentWorkbench } from "./components/AgentWorkbench";
import { AcpProviderPicker } from "./components/AcpProviderPicker";
import { LazyGitSurface } from "./components/LazyGitSurface";
import { ReferenceDock } from "./components/ReferenceDock";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { applyDiskToTabs, captureProjectBag, emptyProjectBag, eventBelongsToActiveProject, explorerPathsForGitChanges, gitChangeType, gitStatusEqual, gitStatusPaths, knownProjectSeed, snapshotFromBag } from "./project-ui";
import { createAutoSaver } from "./auto-save";
import { createGitPollingScheduler } from "./git-polling";
import { createGitRequestCoordinator } from "./git-request";
import { findPaneForPath, isDirty, useAppStore } from "./store";
import type { EditorPaneId, EditorTab } from "./types";
import type { CodeSelection } from "./references";
import { captureFileReference, captureSelectionReference, captureTextFileReference, copyReference } from "./references";
import { copyTextToClipboard } from "./clipboard";
import { basenameFromPath, joinWorkspacePath, renameEntryPath } from "./explorer-actions";
import { shouldShowReferenceDock, terminalPanelVisible } from "./layout-prefs";
import { PRIMARY_MODE_LABELS, PRIMARY_MODES } from "./navigation";
import { lazygitTerminals, shouldStartLazygitSession } from "./terminal-ownership";

type PaletteAction = { label: string; shortcut?: string; run: () => void };

function fileName(path: string): string { return path.split(/[\\/]/).filter(Boolean).pop() ?? path; }
function workspaceRelativePath(value: string, root: string): string | undefined {
  const normalizedPath = value.replaceAll("\\", "/");
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/, "");
  if (normalizedPath === normalizedRoot) return "";
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) return normalizedPath.slice(normalizedRoot.length + 1);
  if (normalizedPath.startsWith("/") || /^[a-zA-Z]:\//.test(normalizedPath)) return undefined;
  const relative = normalizedPath.replace(/^\.\//, "");
  return relative.split("/").some((part) => part === "..") ? undefined : relative;
}
function fuzzy(value: string, query: string): boolean {
  let position = 0;
  const lower = value.toLowerCase();
  for (const char of query.toLowerCase()) { position = lower.indexOf(char, position); if (position < 0) return false; position += 1; }
  return true;
}

function leavingSnapshot(): ProjectSessionSnapshot | undefined {
  const state = useAppStore.getState();
  return state.workspace ? snapshotFromBag(state.workspace, captureProjectBag(state)) : undefined;
}

export default function App() {
  const token = useAppStore((state) => state.token);
  const workspace = useAppStore((state) => state.workspace);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const openProjects = useAppStore((state) => state.openProjects);
  const knownProjects = useAppStore((state) => state.knownProjects);
  const mode = useAppStore((state) => state.mode);
  const git = useAppStore((state) => state.git);
  const reviewScope = useAppStore((state) => state.review.scope);
  const directories = useAppStore((state) => state.directories);
  const terminals = useAppStore((state) => state.terminals);
  const acpSessions = useAppStore((state) => state.acpSessions);
  const tabs = useAppStore((state) => state.tabs);
  const panes = useAppStore((state) => state.panes);
  const focusedPaneId = useAppStore((state) => state.focusedPaneId);
  const explorerWidth = useAppStore((state) => state.explorerWidth);
  const notices = useAppStore((state) => state.notices);
  const recentChanges = useAppStore((state) => state.recentChanges);
  const referenceKit = useAppStore((state) => state.referenceKit);
  const terminalError = useAppStore((state) => state.terminalError);
  const setToken = useAppStore((state) => state.setToken);
  const setDirectory = useAppStore((state) => state.setDirectory);
  const addTab = useAppStore((state) => state.addTab);
  const updateTab = useAppStore((state) => state.updateTab);
  const setActivePath = useAppStore((state) => state.setActivePath);
  const setSelected = useAppStore((state) => state.setSelected);
  const setGit = useAppStore((state) => state.setGit);
  const setTerminals = useAppStore((state) => state.setTerminals);
  const setAcpSessions = useAppStore((state) => state.setAcpSessions);
  const addAcpSession = useAppStore((state) => state.addAcpSession);
  const applyAcpEvent = useAppStore((state) => state.applyAcpEvent);
  const addTerminal = useAppStore((state) => state.addTerminal);
  const setNotice = useAppStore((state) => state.setNotice);
  const setMode = useAppStore((state) => state.setMode);
  const setReview = useAppStore((state) => state.setReview);
  const markRecent = useAppStore((state) => state.markRecent);
  const setPendingLocation = useAppStore((state) => state.setPendingLocation);
  const setTerminalError = useAppStore((state) => state.setTerminalError);
  const setTerminalCollapsed = useAppStore((state) => state.setTerminalCollapsed);
  const setTerminalMaximized = useAppStore((state) => state.setTerminalMaximized);
  const [starting, setStarting] = useState(true);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState<string>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [addingProject, setAddingProject] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [providerPickerLoading, setProviderPickerLoading] = useState(false);
  const [providerPickerError, setProviderPickerError] = useState<string>();
  const [providerPickerProviders, setProviderPickerProviders] = useState<Awaited<ReturnType<typeof getAcpProviders>>>([]);
  const [startingProviderId, setStartingProviderId] = useState<string>();
  const startingProviderRef = useRef<string>();
  const gitRequestRef = useRef(createGitRequestCoordinator());

  const applyLists = (result: Pick<ProjectMutationResponse, "activeProjectId" | "openProjects" | "knownProjects"> & { acpSessions?: AcpSession[] }, restoreError?: string) => {
    useAppStore.getState().setProjectSession({
      activeProjectId: result.activeProjectId ?? undefined,
      openProjects: result.openProjects,
      knownProjects: result.knownProjects,
      restoreError,
    });
    setAcpSessions(result.acpSessions ?? []);
  };

  const isCurrentProject = (projectId: string, nextToken: string): boolean => {
    const current = useAppStore.getState();
    return current.token === nextToken && current.activeProjectId === projectId && current.workspace?.rootPath === projectId;
  };

  const nextGitRequest = (): number => {
    return gitRequestRef.current.begin();
  };

  const gitRequestIsCurrent = (requestId: number, projectId: string, nextToken: string): boolean => {
    const current = useAppStore.getState();
    return gitRequestRef.current.isCurrent(requestId, projectId, nextToken, {
      token: current.token,
      activeProjectId: current.activeProjectId,
      workspaceRoot: current.workspace?.rootPath,
    });
  };

  const allExplorerPaths = (): string[] => {
    const state = useAppStore.getState();
    return [...new Set(["", ...Object.keys(state.directories), ...Object.entries(state.expanded).flatMap(([path, open]) => open ? [path] : [])])];
  };

  const refreshDirectories = async (paths: string[], nextToken: string, projectId: string, requestId?: number) => {
    await Promise.all(paths.map(async (path) => {
      try {
        const entries = await listFiles(path, nextToken);
        if ((!requestId || gitRequestIsCurrent(requestId, projectId, nextToken)) && isCurrentProject(projectId, nextToken)) {
          setDirectory(path, { entries, loading: false });
        }
      } catch {
        // Keep the previous tree if an event races a deleted directory or project switch.
      }
    }));
  };

  const handleExternalChange = async (
    path: string,
    change: "changed" | "created" | "deleted",
    context: { projectId?: string; nextToken?: string; requestId?: number; refreshExplorer?: boolean } = {},
  ) => {
    const current = useAppStore.getState();
    const currentWorkspace = current.workspace;
    const projectId = context.projectId ?? current.activeProjectId;
    const nextToken = context.nextToken ?? current.token;
    const isCurrentOperation = () => Boolean(projectId && nextToken && isCurrentProject(projectId, nextToken))
      && (context.requestId === undefined || gitRequestIsCurrent(context.requestId, projectId!, nextToken!));
    if (!projectId || !nextToken || !isCurrentOperation()) return;
    const matching = current.tabs.find((tab) => tab.path === path);
    if (!matching) {
      markRecent(path);
      if (context.refreshExplorer !== false && currentWorkspace) void refreshDirectories([""], nextToken, projectId);
      return;
    }
    try {
      const external = await readFile(matching.path, nextToken);
      if (!isCurrentOperation()) return;
      const latest = useAppStore.getState().tabs.find((tab) => tab.path === path);
      if (!latest || external.binary || (external.content === latest.content && !latest.error)) return;
      markRecent(path);
      if (isDirty(latest)) {
        if (latest.conflict?.externalContent !== external.content) updateTab(path, { conflict: { externalContent: external.content }, error: undefined });
      } else {
        updateTab(path, { content: external.content, savedContent: external.content, conflict: undefined, error: undefined });
        setNotice(`${latest.name} reloaded from disk`, "info");
      }
    } catch (error) {
      if (!isCurrentOperation()) return;
      const latest = useAppStore.getState().tabs.find((tab) => tab.path === path);
      if (!latest) return;
      const message = change === "deleted" ? "File deleted on disk" : error instanceof Error ? error.message : "Unable to reload file";
      if (latest.error !== message) {
        if (change === "deleted") updateTab(path, { error: message });
        setNotice(change === "deleted" ? `${latest.name} was deleted on disk` : `Could not reload ${latest.name}`, "error");
      }
      markRecent(path);
    }
    if (context.refreshExplorer !== false && change !== "changed" && currentWorkspace) void refreshDirectories([""], nextToken, projectId);
  };

  const reconcileGitStatus = async (
    status: GitStatus,
    projectId: string,
    nextToken: string,
    requestId: number,
    options: { refreshAll?: boolean; probeOpenFiles?: boolean } = {},
  ): Promise<void> => {
    if (!gitRequestIsCurrent(requestId, projectId, nextToken)) return;
    const previous = useAppStore.getState().git;
    const changed = !gitStatusEqual(previous, status);
    if (changed) setGit(status);
    if (!status.isRepository) {
      if (options.refreshAll) await refreshDirectories(allExplorerPaths(), nextToken, projectId, requestId);
      return;
    }
    const changedPaths = previous ? gitStatusPaths(previous, status) : [];
    changedPaths.forEach((path) => {
      markRecent(path);
    });
    if (changed || options.refreshAll) {
      const paths = options.refreshAll
        ? allExplorerPaths()
        : explorerPathsForGitChanges(useAppStore.getState().expanded, changedPaths);
      await refreshDirectories(paths, nextToken, projectId, requestId);
    }
    if (options.probeOpenFiles) {
      const tabs = useAppStore.getState().tabs.filter((tab) => !tab.binary);
      await Promise.all(tabs.map(async (tab) => {
        const latest = useAppStore.getState();
        const change = gitChangeType(previous, status, tab.path);
        if (!gitRequestIsCurrent(requestId, projectId, nextToken) || !latest.tabs.some((candidate) => candidate.path === tab.path)) return;
        await handleExternalChange(tab.path, change, { projectId, nextToken, requestId, refreshExplorer: false });
      }));
    }
  };

  const requestGitStatus = async (
    nextToken: string,
    projectId: string,
    options: { refreshAll?: boolean; probeOpenFiles?: boolean } = {},
  ): Promise<{ ok: boolean; requestId: number }> => {
    const requestId = nextGitRequest();
    try {
      const status = await getGitStatus(nextToken);
      if (!gitRequestIsCurrent(requestId, projectId, nextToken)) return { ok: false, requestId };
      await reconcileGitStatus(status, projectId, nextToken, requestId, options);
      return { ok: true, requestId };
    } catch (error) {
      if (gitRequestIsCurrent(requestId, projectId, nextToken)) setNotice(error instanceof Error ? error.message : "Git status unavailable", "error");
      return { ok: false, requestId };
    }
  };

  const loadExplorerAndGit = async (nextToken: string) => {
    const projectId = useAppStore.getState().activeProjectId;
    if (!projectId) return;
    const requestId = nextGitRequest();
    let status: GitStatus | undefined;
    try {
      status = await getGitStatus(nextToken);
      if (gitRequestIsCurrent(requestId, projectId, nextToken)) setGit(status);
    } catch (error) {
      if (gitRequestIsCurrent(requestId, projectId, nextToken)) setNotice(error instanceof Error ? error.message : "Git status unavailable", "error");
    }
    try {
      const entries = await listFiles("", nextToken);
      if (gitRequestIsCurrent(requestId, projectId, nextToken)) setDirectory("", { entries, loading: false });
    } catch (error) {
      if (gitRequestIsCurrent(requestId, projectId, nextToken)) setDirectory("", { entries: [], loading: false, error: error instanceof Error ? error.message : "Unable to read workspace" });
    }
  };

  const reconcileTerminals = async (nextToken: string) => {
    let existing: TerminalSession[] = [];
    try { existing = await getTerminals(nextToken); } catch { /* An empty terminal list is valid before the backend is ready. */ }
    for (const kind of missingTerminalKinds(existing)) {
      try {
        const created = await createTerminal(kind, nextToken);
        existing.push(created);
        if (kind === "lazygit") setTerminalError(undefined);
      } catch (error) {
        if (kind === "lazygit") setTerminalError("Lazygit is unavailable. Install lazygit to use LazyGit mode.");
        else setNotice(`${kind} terminal could not be started`, "error");
      }
    }
    if (existing.some((terminal) => terminal.kind === "lazygit" && !terminal.alive)) setTerminalError("Lazygit exited. Restart from LazyGit mode or close the session.");
    setTerminals(existing);
  };

  const reopenFromSnapshot = async (snapshot: ProjectSessionSnapshot | undefined, nextToken: string) => {
    if (!snapshot) return;
    useAppStore.setState({
      panes: {
        primary: { tabPaths: [...snapshot.panes.primary.tabPaths], activePath: snapshot.panes.primary.activePath },
        secondary: { tabPaths: [...snapshot.panes.secondary.tabPaths], activePath: snapshot.panes.secondary.activePath },
      },
      secondaryOpen: snapshot.secondaryOpen,
      mode: snapshot.mode,
      expanded: Object.fromEntries(snapshot.expandedPaths.map((path) => [path, true])),
    });
    const nextTabs: EditorTab[] = [];
    for (const filePath of snapshot.openFilePaths) {
      const tab: EditorTab = { path: filePath, name: fileName(filePath), content: "", savedContent: "", language: language(filePath) };
      try {
        const result = await readFile(filePath, nextToken);
        nextTabs.push({ ...tab, content: result.content, savedContent: result.content, binary: result.binary });
      } catch (error) {
        nextTabs.push({ ...tab, error: error instanceof Error ? error.message : "Unable to open file" });
        setNotice(`Could not open ${fileName(filePath)}`, "error");
      }
    }
    useAppStore.setState({ tabs: nextTabs });
  };

  const reloadTabsFromDisk = async (nextToken: string) => {
    const currentTabs = useAppStore.getState().tabs;
    const disk: Record<string, { content?: string; binary?: boolean; error?: string }> = {};
    await Promise.all(currentTabs.map(async (tab) => {
      try {
        const result = await readFile(tab.path, nextToken);
        disk[tab.path] = result.binary ? { binary: true } : { content: result.content };
      } catch (error) {
        disk[tab.path] = { error: error instanceof Error ? error.message : "Unable to open file" };
      }
    }));
    useAppStore.getState().applyDiskTabs(applyDiskToTabs(currentTabs, disk));
  };

  const showProject = async (nextWorkspace: Workspace, projectId: string, nextToken: string, snapshot?: ProjectSessionSnapshot, reuseBag = false) => {
    const store = useAppStore.getState();
    const hasBag = reuseBag && Boolean(store.projectBags[projectId]);
    store.restoreProjectBag(projectId, nextWorkspace, hasBag ? undefined : emptyProjectBag());
    localStorage.setItem("ainide:last-workspace", nextWorkspace.rootPath);
    await loadExplorerAndGit(nextToken);
    if (hasBag) await reloadTabsFromDisk(nextToken);
    else await reopenFromSnapshot(snapshot, nextToken);
    await reconcileTerminals(nextToken);
  };

  const acceptMutation = async (result: ProjectMutationResponse, nextToken: string, reuseBag: boolean) => {
    applyLists(result);
    if (!result.workspace || !result.activeProjectId) {
      useAppStore.getState().clearActiveProject();
      return;
    }
    await showProject(result.workspace, result.activeProjectId, nextToken, result.snapshot, reuseBag);
    setAcpSessions(result.acpSessions ?? []);
  };

  const openFromPath = async (path: string, nextToken: string) => {
    useAppStore.getState().stashActiveBag();
    const result = await openProject(path, nextToken, leavingSnapshot());
    await acceptMutation(result, nextToken, true);
  };

  const switchToOpenProject = async (projectId: string) => {
    if (!token) return;
    useAppStore.getState().stashActiveBag();
    const result = await switchProject(projectId, token, leavingSnapshot());
    await acceptMutation(result, token, true);
  };

  const closeActiveProject = async () => {
    if (!token || !activeProjectId) return;
    const closedId = activeProjectId;
    useAppStore.getState().stashActiveBag();
    const result = await closeProject(closedId, token, leavingSnapshot());
    useAppStore.getState().removeProjectBag(closedId);
    await acceptMutation(result, token, true);
  };

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        const nextToken = session.token ?? session.sessionToken ?? "";
        setToken(nextToken);
        applyLists(session, session.restoreError);
        if (session.restoreError) setPickerError(session.restoreError);
        if (session.workspace && session.activeProjectId) {
          await showProject(session.workspace, session.activeProjectId, nextToken, session.snapshot, false);
          setAcpSessions(session.acpSessions ?? []);
        }
      } catch (error) {
        setPickerError(error instanceof Error ? error.message : "Could not connect to the ainide server");
      } finally { setStarting(false); }
    })();
    // This is the one startup request; workspace changes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = new WebSocket(websocketUrl("/events", token));
    socket.onmessage = (event) => {
      const message = parseEvent(String(event.data));
      if (!message || !("type" in message)) return;
      if (!("projectId" in message)) return;
      const current = useAppStore.getState();
      if (!eventBelongsToActiveProject(message, current.activeProjectId)) return;
       if (message.type === "git_changed") {
         const requestId = nextGitRequest();
         void reconcileGitStatus(message.status, message.projectId, current.token, requestId, { probeOpenFiles: true });
       }
       if (message.type === "file_changed") void handleExternalChange(message.path, message.change, { projectId: message.projectId, nextToken: current.token });
       if (message.type === "workspace_changed") {
         const active = useAppStore.getState();
         if (active.workspace && active.token && active.activeProjectId) void requestGitStatus(active.token, active.activeProjectId, { refreshAll: true, probeOpenFiles: true });
       }
    };
    socket.onerror = () => setNotice("Live workspace events disconnected", "error");
    return () => socket.close();
    // Events are reconnected when the session token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    let socket: WebSocket | undefined;
    let retry: number | undefined;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(acpEventsUrl(token));
      socket.onmessage = (event) => {
        const message = parseAcpEvent(String(event.data));
        if (message) applyAcpEvent(message);
      };
      socket.onclose = () => {
        if (!disposed) retry = window.setTimeout(connect, 1_000);
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retry !== undefined) window.clearTimeout(retry);
      socket?.close();
    };
  }, [token, applyAcpEvent]);

  useEffect(() => {
    if (!token || !workspace || !activeProjectId) return;
    const timer = window.setTimeout(() => {
      const state = useAppStore.getState();
      if (!state.workspace || !state.activeProjectId) return;
      void saveProjectSnapshot(token, { projectId: state.activeProjectId, ...snapshotFromBag(state.workspace, captureProjectBag(state)) }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [token, workspace, activeProjectId, tabs, panes, mode, terminals, directories]);

  const openFile = async (entry: FileEntry, requestedPane: EditorPaneId = "primary"): Promise<EditorPaneId | undefined> => {
    if (!token) return undefined;
    setSelected(entry.path);
    const current = useAppStore.getState();
    const owner = findPaneForPath(current.panes, entry.path);
    const paneId = owner ?? requestedPane;
    if (owner) {
      setActivePath(owner, entry.path);
      return owner;
    }
    const tab: EditorTab = { path: entry.path, name: entry.name || fileName(entry.path), content: "", savedContent: "", language: language(entry.path) };
    addTab(paneId, tab);
    try {
      const result = await readFile(entry.path, token);
      updateTab(entry.path, { content: result.content, savedContent: result.content, binary: result.binary });
    } catch (error) {
      updateTab(entry.path, { error: error instanceof Error ? error.message : "Unable to open file" });
      setNotice(`Could not open ${fileName(entry.path)}`, "error");
    }
    return paneId;
  };

  const saveFile = async (tab: EditorTab) => {
    if (!token || tab.binary || tab.error || !isDirty(tab)) return;
    try { await writeFile(tab.path, tab.content, token); updateTab(tab.path, { savedContent: tab.content, conflict: undefined }); setNotice(`${tab.name} saved`, "success"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Save failed", "error"); }
  };

  const autoSaver = useMemo(() => createAutoSaver(async (path) => {
    const state = useAppStore.getState();
    const tab = state.tabs.find((item) => item.path === path);
    if (!tab || !state.token || tab.binary || tab.error || !isDirty(tab)) return;
    try {
      await writeFile(tab.path, tab.content, state.token);
      state.updateTab(tab.path, { savedContent: tab.content, conflict: undefined });
    } catch {
      // Failed auto-saves stay silent; manual save and close confirm cover the failure path.
    }
  }), []);

  const handleContentChange = (path: string, content: string) => {
    updateTab(path, { content });
    autoSaver.schedule(path);
  };

  const openReference = (path: string, line: number, column?: number) => {
    const relativePath = workspace ? workspaceRelativePath(path, workspace.rootPath) : path;
    if (!relativePath) {
      setNotice("Provider location is outside the active workspace", "error");
      return;
    }
    path = relativePath;
    const current = useAppStore.getState();
    const paneId = findPaneForPath(current.panes, path) ?? current.focusedPaneId;
    void openFile({ name: fileName(path), path, type: "file" }, paneId).then((openedPane) => setPendingLocation({ path, line, column, paneId: openedPane ?? paneId }));
  };

  const refresh = async () => {
    if (!workspace || !token) return;
    const projectId = activeProjectId ?? workspace.rootPath;
    const refreshed = await requestGitStatus(token, projectId, { refreshAll: true, probeOpenFiles: true });
    if (!refreshed.ok && gitRequestIsCurrent(refreshed.requestId, projectId, token)) {
      await refreshDirectories(allExplorerPaths(), token, projectId, refreshed.requestId);
    }
  };

  useEffect(() => {
    if (!token || !workspace || !activeProjectId || git?.isRepository !== true) return;
    const projectId = activeProjectId;
    const scheduler = createGitPollingScheduler(async () => { await requestGitStatus(token, projectId, { probeOpenFiles: true }); });
    scheduler.start();
    return () => scheduler.stop();
    // The scheduler is recreated only when its project, token, or repository kind changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workspace?.rootPath, activeProjectId, git?.isRepository]);

  const switchToReview = async (restart = false) => {
    if (!token) {
      setMode("review");
      return;
    }

    const cached = useAppStore.getState().review;
    const hasCachedSession = !restart && Boolean(cached.url) && cached.scope === reviewScope;

    setMode("review");

    if (hasCachedSession) {
      setReview({ loading: false });
      try {
        const status = await getReviewStatus(token);
        if (status.running && status.url && status.scope === reviewScope) {
          if (status.url !== cached.url || status.message) setReview({ ...status, loading: false });
          return;
        }
        const scopeMismatch = status.running && status.scope !== reviewScope;
        setReview({ loading: true, url: undefined, message: undefined });
        setReview({ ...(await startReview(token, reviewScope, scopeMismatch)), loading: false });
      } catch (error) {
        setReview({ loading: false, available: false, message: error instanceof Error ? error.message : "Review could not start" });
      }
      return;
    }

    try {
      if (!restart) {
        const status = await getReviewStatus(token);
        if (status.running && status.url && status.scope === reviewScope) {
          setReview({ ...status, loading: false });
          return;
        }
        const scopeMismatch = status.running && status.scope !== reviewScope;
        setReview({ loading: true, url: undefined, message: undefined });
        setReview({ ...(await startReview(token, reviewScope, scopeMismatch)), loading: false });
        return;
      }
      setReview({ loading: true, url: undefined, message: undefined });
      setReview({ ...(await startReview(token, reviewScope, true)), loading: false });
    } catch (error) {
      setReview({ loading: false, available: false, message: error instanceof Error ? error.message : "Review could not start" });
    }
  };

  const switchToLazyGit = async () => {
    setMode("lazygit");
    if (!token) return;
    const state = useAppStore.getState();
    const existing = lazygitTerminals(state.terminals, state.activeProjectId);
    if (!shouldStartLazygitSession(existing)) return;
    try {
      const created = await createTerminal("lazygit", token);
      addTerminal(created);
      setTerminalError(undefined);
    } catch {
      setTerminalError("Lazygit is unavailable. Install lazygit to use LazyGit mode.");
    }
  };

  const newTerminal = async (kind: TerminalSession["kind"] = "custom", title?: string) => {
    if (!token) return;
    try {
      const created = await createTerminal(kind, token, title);
      addTerminal(created);
      if (kind === "agent") useAppStore.getState().setFocusedSession(created.id);
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "Terminal could not be started", "error"); }
  };

  const addSelectionReference = (tab: EditorTab, selection: CodeSelection, copy = false) => {
    if (tab.binary || tab.error) { setNotice("This file cannot be copied as text", "error"); return; }
    const reference = captureSelectionReference({ path: tab.path, content: tab.content, language: tab.language, selection });
    if (copy) void copyReference(reference).then((result) => setNotice(result.ok ? "Selection reference copied" : result.error ?? "Could not copy reference", result.ok ? "success" : "error"));
    else { useAppStore.getState().addReference(reference); setNotice(`Added ${tab.path} lines ${reference.startLine}-${reference.endLine} to the kit`, "success"); }
  };

  const addWholeFileReference = async (tab: EditorTab | FileEntry, copy = false) => {
    if (!token) return;
    const path = tab.path;
    const openTab = "content" in tab ? tab : useAppStore.getState().tabs.find((item) => item.path === path);
    if (openTab?.binary || openTab?.error) { setNotice("This file cannot be copied as text", "error"); return; }
    try {
      const reference = openTab ? captureFileReference({ path, content: openTab.content, language: openTab.language }) : await captureTextFileReference({ path, language: language(path), read: () => readFile(path, token) });
      if (copy) {
        const result = await copyReference(reference);
        setNotice(result.ok ? "File reference copied" : result.error ?? "Could not copy reference", result.ok ? "success" : "error");
      } else {
        useAppStore.getState().addReference(reference);
        setNotice(`Added ${path} to the reference kit`, "success");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This file cannot be copied as text", "error");
    }
  };

  const copyExplorerPath = async (entry: FileEntry) => {
    const ok = await copyTextToClipboard(entry.path);
    setNotice(ok ? "Path copied" : "Could not copy path", ok ? "success" : "error");
  };

  const copyExplorerContents = async (entry: FileEntry) => {
    if (!token) return;
    try {
      const result = await readFile(entry.path, token);
      if (result.binary) { setNotice("This file cannot be copied as text", "error"); return; }
      const ok = await copyTextToClipboard(result.content);
      setNotice(ok ? "Contents copied" : "Could not copy contents", ok ? "success" : "error");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read file", "error");
    }
  };

  const createExplorerEntry = async (parentPath: string, type: "file" | "directory") => {
    if (!token) return;
    const name = window.prompt(type === "file" ? "New file name" : "New folder name");
    if (!name?.trim()) return;
    let nextPath: string;
    try {
      nextPath = joinWorkspacePath(parentPath, name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Invalid name", "error");
      return;
    }
    try {
      await createPath(nextPath, type, token);
      useAppStore.setState((state) => ({ expanded: { ...state.expanded, [parentPath]: true } }));
      setNotice(`Created ${nextPath}`, "success");
      await refresh();
      if (type === "file") void openFile({ name: basenameFromPath(nextPath), path: nextPath, type: "file" });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Create failed", "error");
    }
  };

  const renameExplorerEntry = async (entry: FileEntry) => {
    if (!token) return;
    const newName = window.prompt("Rename to", basenameFromPath(entry.path));
    if (!newName?.trim() || newName.trim() === basenameFromPath(entry.path)) return;
    let nextPath: string;
    try {
      nextPath = renameEntryPath(entry.path, newName);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Invalid name", "error");
      return;
    }
    try {
      await renameFile(entry.path, nextPath, token);
      useAppStore.getState().renameTabPath(entry.path, nextPath);
      setSelected(nextPath);
      setNotice(`Renamed to ${nextPath}`, "success");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Rename failed", "error");
    }
  };

  const deleteExplorerEntry = async (entry: FileEntry) => {
    if (!token) return;
    if (!window.confirm(`Delete ${entry.path}?`)) return;
    if (entry.type === "file") {
      await autoSaver.flush(entry.path);
      const tab = useAppStore.getState().tabs.find((item) => item.path === entry.path);
      if (tab && isDirty(tab) && !window.confirm(`Discard unsaved changes to ${tab.name} before deleting?`)) return;
    }
    try {
      await deleteFile(entry.path, token);
      const state = useAppStore.getState();
      const paneId = findPaneForPath(state.panes, entry.path);
      if (paneId) state.closeTab(paneId, entry.path);
      autoSaver.cancel(entry.path);
      setNotice(`Deleted ${basenameFromPath(entry.path)}`, "success");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Delete failed", "error");
    }
  };

  const loadAcpProviders = async () => {
    if (!token) return;
    setProviderPickerLoading(true);
    setProviderPickerError(undefined);
    try {
      setProviderPickerProviders(await getAcpProviders(token));
    } catch (error) {
      setProviderPickerProviders([]);
      setProviderPickerError(error instanceof Error ? error.message : "ACP providers could not be loaded");
    } finally {
      setProviderPickerLoading(false);
    }
  };

  const newAgent = () => {
    if (!token) return;
    setProviderPickerOpen(true);
    void loadAcpProviders();
  };

  const startAcpProvider = async (providerId: string) => {
    if (!token || startingProviderRef.current) return;
    startingProviderRef.current = providerId;
    setStartingProviderId(providerId);
    setProviderPickerError(undefined);
    try {
      const created = await createAcpSession(providerId, token);
      addAcpSession(created);
      if (useAppStore.getState().activeProjectId === created.projectId) {
        useAppStore.getState().setFocusedSession(created.id);
        setMode("agents");
      }
      setProviderPickerOpen(false);
    } catch (error) {
      setProviderPickerError(error instanceof Error ? error.message : "ACP agent could not be started");
    } finally {
      startingProviderRef.current = undefined;
      setStartingProviderId(undefined);
    }
  };

  const loadedFiles = useMemo(() => Object.values(directories).flatMap((directory) => directory.entries).filter((entry, index, all) => entry.type === "file" && all.findIndex((other) => other.path === entry.path) === index), [directories]);
  const quickResults = (searchResults.length ? searchResults : loadedFiles).filter((entry) => !query || fuzzy(`${entry.name} ${entry.path}`, query)).slice(0, 40);
  const paletteActions: PaletteAction[] = [
    { label: "Open File", shortcut: "⌘ P", run: () => { setPaletteOpen(false); setQuickOpen(true); } },
    { label: "Open another project", run: () => { setPaletteOpen(false); setAddingProject(true); } },
    ...openProjects.filter((project) => project.projectId !== activeProjectId).map((project) => ({
      label: `Switch to ${project.name}`,
      run: () => { setPaletteOpen(false); void switchToOpenProject(project.projectId).catch((error) => setNotice(error instanceof Error ? error.message : "Could not switch project", "error")); },
    })),
    { label: "Close project", run: () => { setPaletteOpen(false); void closeActiveProject().catch((error) => setNotice(error instanceof Error ? error.message : "Could not close project", "error")); } },
    { label: "New Terminal", run: () => { setPaletteOpen(false); void newTerminal(); } },
     { label: "Open Agent", run: () => { setPaletteOpen(false); newAgent(); } },
    { label: "Open Shell", run: () => { setPaletteOpen(false); void newTerminal("shell"); } },
    { label: "Switch to Edit mode", run: () => { setMode("edit"); setPaletteOpen(false); } },
    { label: "Switch to Review mode", run: () => { setPaletteOpen(false); void switchToReview(); } },
    { label: "Switch to Agents mode", run: () => { setMode("agents"); setPaletteOpen(false); } },
    { label: "Switch to LazyGit mode", run: () => { setPaletteOpen(false); void switchToLazyGit(); } },
     { label: "Save", shortcut: "⌘ S", run: () => { const activePath = panes[focusedPaneId].activePath; const tab = tabs.find((item) => item.path === activePath); if (tab) void saveFile(tab); setPaletteOpen(false); } },
    { label: "Refresh Git and files", run: () => { setPaletteOpen(false); void refresh(); } },
     { label: "Restart Review", run: () => { setPaletteOpen(false); void switchToReview(true); } },
  ].filter((action) => !query || fuzzy(action.label, query));

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (!command) return;
      if (event.shiftKey && event.key.toLowerCase() === "p") { event.preventDefault(); setPaletteOpen(true); setQuickOpen(false); setQuery(""); }
      else if (!event.shiftKey && event.key.toLowerCase() === "p") { event.preventDefault(); setQuickOpen(true); setPaletteOpen(false); setQuery(""); }
       else if (event.key.toLowerCase() === "s") { event.preventDefault(); const activePath = panes[focusedPaneId].activePath; const tab = tabs.find((item) => item.path === activePath); if (tab) void saveFile(tab); }
        else if (event.key.toLowerCase() === "j") {
          event.preventDefault();
          const state = useAppStore.getState();
          const next = !state.terminalCollapsed;
          if (state.terminalMaximized) setTerminalMaximized(false);
          setTerminalCollapsed(next);
        }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
    // Keyboard commands intentionally use current actions from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [tabs, panes, focusedPaneId, token]);

  useEffect(() => {
    if (!quickOpen || !query || !token) { setSearchResults([]); return; }
    const timer = window.setTimeout(() => void searchFiles(query, token).then(setSearchResults).catch(() => setSearchResults([])), 180);
    return () => window.clearTimeout(timer);
  }, [quickOpen, query, token]);

  const pickerKnown = knownProjects;
  const pickerInitial = knownProjectSeed(knownProjects, localStorage.getItem("ainide:last-workspace"));

  if (starting) return <main className="boot-screen"><div className="brand-mark">ai<span>ni</span>de</div><span className="loading-line">Connecting to local runtime...</span></main>;
  if (!workspace) return <WorkspacePicker initialPath={pickerInitial} knownProjects={pickerKnown} busy={pickerBusy} error={pickerError} onOpen={(path) => {
    setPickerBusy(true); setPickerError(undefined);
    void openFromPath(path, token).catch((error) => setPickerError(error instanceof Error ? error.message : "Could not open workspace")).finally(() => setPickerBusy(false));
  }} />;

  const changedRecently = Object.values(recentChanges).filter((time) => Date.now() - time < 10 * 60 * 1000).length;
  return <div className={`app-shell ${mobileSidebar ? "mobile-sidebar-open" : ""}`}>
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setMobileSidebar(!mobileSidebar)}>☰</button>
      <ProjectSwitcher
        activeName={workspace.name || fileName(workspace.rootPath)}
        openProjects={openProjects}
        activeProjectId={activeProjectId}
        onSwitch={(projectId) => void switchToOpenProject(projectId).catch((error) => setNotice(error instanceof Error ? error.message : "Could not switch project", "error"))}
        onOpenAnother={() => setAddingProject(true)}
        onClose={() => void closeActiveProject().catch((error) => setNotice(error instanceof Error ? error.message : "Could not close project", "error"))}
      />
        <div className="mode-switch" role="tablist">{PRIMARY_MODES.map((entry) => {
          const label = PRIMARY_MODE_LABELS[entry];
          const active = mode === entry;
          const onClick = () => {
            if (entry === "review") void switchToReview();
            else if (entry === "lazygit") void switchToLazyGit();
            else setMode(entry);
          };
           return <button key={entry} className={active ? "active" : ""} role="tab" aria-selected={active} onClick={onClick}>{label}{entry === "agents" && <span className="mode-count">{terminals.filter((terminal) => terminal.kind === "agent" && terminal.alive).length + acpSessions.filter((session) => session.status === "live" || session.status === "waiting").length}</span>}</button>;
        })}</div>
        <div className="top-actions"><button className="git-summary" onClick={() => void switchToReview()} title="Open review"><span className="status-pip" />{git?.summary.filesChanged ? <>Review changes <strong>{git.summary.filesChanged} files · +{git.summary.insertions} −{git.summary.deletions}</strong></> : "Working tree clean"}</button><span className="agent-activity" title="Files changed recently"><i /> Agent {changedRecently ? `${changedRecently} change${changedRecently === 1 ? "" : "s"}` : "idle"}</span><button className="command-button" onClick={() => { setPaletteOpen(true); setQuery(""); }}>⌘⇧P <span>Commands</span></button></div>
    </header>
    <div className="workbench">
        <div className="explorer-wrap" style={{ width: explorerWidth }}><Explorer
          onOpenFile={(entry, secondary) => void openFile(entry, secondary ? "secondary" : "primary")}
          onRefresh={() => void refresh()}
          onCopyPath={(entry) => void copyExplorerPath(entry)}
          onCopyContents={(entry) => void copyExplorerContents(entry)}
          onAddToReferenceKit={(entry) => void addWholeFileReference(entry)}
          onRenameEntry={(entry) => void renameExplorerEntry(entry)}
          onDeleteEntry={(entry) => void deleteExplorerEntry(entry)}
          onCreateEntry={(parentPath, type) => void createExplorerEntry(parentPath, type)}
        /></div>
      <div className="explorer-splitter" onPointerDown={(event) => {
        const move = (e: PointerEvent) => { const width = Math.max(190, Math.min(420, e.clientX)); useAppStore.setState({ explorerWidth: width }); localStorage.setItem("ainide:explorer-width", String(width)); };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); event.preventDefault();
      }} />
       <main className="main-column">
          <div className="mode-surface" hidden={mode !== "edit"}>
           <EditorSurface
               onSave={(tab) => void saveFile(tab)}
               onContentChange={handleContentChange}
               flushAutoSave={(path) => autoSaver.flush(path)}
               cancelAutoSave={(path) => autoSaver.cancel(path)}
               onCopySelection={(tab, selection) => addSelectionReference(tab, selection, true)}
               onAddSelectionToKit={(tab, selection) => addSelectionReference(tab, selection)}
               onCopyFile={(tab) => void addWholeFileReference(tab, true)}
               onAddFileToKit={(tab) => void addWholeFileReference(tab)}
             />
             {shouldShowReferenceDock(referenceKit.length) && <ReferenceDock />}
           </div>
            <div className="mode-surface" hidden={mode !== "agents"}><AgentWorkbench onNewAgent={newAgent} onOpenReference={openReference} /></div>
           <div className="mode-surface" hidden={mode !== "review"}>
            <ReviewSurface scope={reviewScope} onScopeChange={(scope) => setReview({ scope })} onStart={() => void switchToReview(true)} />
          </div>
           <div className="mode-surface" hidden={mode !== "lazygit"}><LazyGitSurface onOpenReference={openReference} /></div>
         {terminalPanelVisible(mode) && <TerminalPanel onNewTerminal={(kind) => void newTerminal(kind)} onOpenReference={openReference} />}
      </main>
    </div>
    <div className="notices">{notices.map((notice) => <button className={`notice ${notice.tone}`} key={notice.id} onClick={() => useAppStore.getState().dismissNotice(notice.id)}>{notice.text}<span>×</span></button>)}</div>
    {terminalError && mode !== "lazygit" && <div className="terminal-error-toast"><b>Terminal note</b> {terminalError}</div>}
     {addingProject && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddingProject(false); }}>
      <WorkspacePicker initialPath="" knownProjects={knownProjects.filter((project) => project.projectId !== activeProjectId)} busy={pickerBusy} error={pickerError} onOpen={(path) => {
        setPickerBusy(true); setPickerError(undefined);
        void openFromPath(path, token).then(() => setAddingProject(false)).catch((error) => setPickerError(error instanceof Error ? error.message : "Could not open workspace")).finally(() => setPickerBusy(false));
      }} />
     </div>}
    {providerPickerOpen && <AcpProviderPicker providers={providerPickerProviders} loading={providerPickerLoading} error={providerPickerError} startingProviderId={startingProviderId} onRetry={() => void loadAcpProviders()} onSelect={(providerId) => void startAcpProvider(providerId)} onClose={() => setProviderPickerOpen(false)} />}
    {(paletteOpen || quickOpen) && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) { setPaletteOpen(false); setQuickOpen(false); } }}>
      <div className="command-modal">
        <div className="command-input"><span>{quickOpen ? "⌕" : "⌘"}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={quickOpen ? "Search files..." : "Type a command..."} onKeyDown={(event) => { if (event.key === "Escape") { setQuickOpen(false); setPaletteOpen(false); } }} /></div>
        <div className="command-list">{quickOpen ? (quickResults.length ? quickResults.map((entry) => <button key={entry.path} onClick={() => { setQuickOpen(false); void openFile(entry); }}>{entry.name}<small>{entry.path}</small></button>) : <div className="command-empty">No loaded files match. Expand folders in the explorer to index them.</div>) : (paletteActions.length ? paletteActions.map((action) => <button key={action.label} onClick={action.run}><span>{action.label}</span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>) : <div className="command-empty">No commands match.</div>)}</div>
      </div>
    </div>}
  </div>;
}

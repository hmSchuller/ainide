import { useEffect, useMemo, useState } from "react";
import type { FileEntry, TerminalSession, Workspace } from "@ainide/shared";
import { createTerminal, getGitStatus, getSession, getTerminals, getWorkspace, listFiles, openWorkspace, parseEvent, readFile, searchFiles, startReview, writeFile, websocketUrl } from "./api";
import { EditorSurface, language } from "./components/Editor";
import { Explorer } from "./components/Explorer";
import { ReviewSurface } from "./components/ReviewSurface";
import { TerminalPanel } from "./components/TerminalPanel";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { isDirty, useAppStore } from "./store";
import type { EditorTab } from "./types";

type PaletteAction = { label: string; shortcut?: string; run: () => void };

function fileName(path: string): string { return path.split(/[\\/]/).filter(Boolean).pop() ?? path; }
function workspaceRelativePath(path: string, root: string): string {
  const normalizedPath = path.replaceAll("\\", "/");
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/, "");
  if (normalizedPath === normalizedRoot) return "";
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) return normalizedPath.slice(normalizedRoot.length + 1);
  return normalizedPath.replace(/^\.\//, "");
}
function fuzzy(value: string, query: string): boolean {
  let position = 0;
  const lower = value.toLowerCase();
  for (const char of query.toLowerCase()) { position = lower.indexOf(char, position); if (position < 0) return false; position += 1; }
  return true;
}

export default function App() {
  const token = useAppStore((state) => state.token);
  const workspace = useAppStore((state) => state.workspace);
  const mode = useAppStore((state) => state.mode);
  const git = useAppStore((state) => state.git);
  const reviewScope = useAppStore((state) => state.review.scope);
  const directories = useAppStore((state) => state.directories);
  const terminals = useAppStore((state) => state.terminals);
  const tabs = useAppStore((state) => state.tabs);
  const activePath = useAppStore((state) => state.activePath);
  const explorerWidth = useAppStore((state) => state.explorerWidth);
  const notices = useAppStore((state) => state.notices);
  const recentChanges = useAppStore((state) => state.recentChanges);
  const terminalError = useAppStore((state) => state.terminalError);
  const setToken = useAppStore((state) => state.setToken);
  const setWorkspace = useAppStore((state) => state.setWorkspace);
  const setDirectory = useAppStore((state) => state.setDirectory);
  const addTab = useAppStore((state) => state.addTab);
  const updateTab = useAppStore((state) => state.updateTab);
  const setActivePath = useAppStore((state) => state.setActivePath);
  const setSelected = useAppStore((state) => state.setSelected);
  const setGit = useAppStore((state) => state.setGit);
  const setTerminals = useAppStore((state) => state.setTerminals);
  const addTerminal = useAppStore((state) => state.addTerminal);
  const setNotice = useAppStore((state) => state.setNotice);
  const setMode = useAppStore((state) => state.setMode);
  const setReview = useAppStore((state) => state.setReview);
  const markRecent = useAppStore((state) => state.markRecent);
  const setPendingLocation = useAppStore((state) => state.setPendingLocation);
  const setTerminalError = useAppStore((state) => state.setTerminalError);
  const [starting, setStarting] = useState(true);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState<string>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);

  const loadWorkspaceData = async (nextWorkspace: Workspace, nextToken: string) => {
    setWorkspace(nextWorkspace);
    localStorage.setItem("ainide:last-workspace", nextWorkspace.rootPath);
    const [entries, status] = await Promise.allSettled([listFiles("", nextToken), getGitStatus(nextToken)]);
    if (entries.status === "fulfilled") setDirectory("", { entries: entries.value, loading: false });
    else setDirectory("", { entries: [], loading: false, error: entries.reason instanceof Error ? entries.reason.message : "Unable to read workspace" });
    if (status.status === "fulfilled") setGit(status.value);
    else setNotice(status.reason instanceof Error ? status.reason.message : "Git status unavailable", "error");
    await reconcileTerminals(nextToken);
  };

  const reconcileTerminals = async (nextToken: string) => {
    let existing: TerminalSession[] = [];
    try { existing = await getTerminals(nextToken); } catch { /* An empty terminal list is valid before the backend is ready. */ }
    const kinds: TerminalSession["kind"][] = ["agent", "shell", "lazygit"];
    for (const kind of kinds) {
      if (!existing.some((terminal) => terminal.kind === kind)) {
        try {
          const created = await createTerminal(kind, nextToken);
          existing.push(created);
          if (kind === "lazygit") setTerminalError(undefined);
        } catch (error) {
          if (kind === "lazygit") setTerminalError("Lazygit is unavailable. Install it or use the Shell terminal.");
          else setNotice(`${kind} terminal could not be started`, "error");
        }
      }
    }
    if (existing.some((terminal) => terminal.kind === "lazygit" && !terminal.alive)) setTerminalError("Lazygit exited: install Lazygit to use the review terminal.");
    setTerminals(existing);
  };

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession();
        const nextToken = session.token ?? session.sessionToken ?? "";
        setToken(nextToken);
        const existing = session.workspace ?? (nextToken ? await getWorkspace(nextToken).catch(() => undefined) : undefined);
        if (existing) await loadWorkspaceData(existing, nextToken);
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
      if (message.type === "git_changed") setGit(message.status);
      if (message.type === "file_changed") void handleExternalChange(message.path, message.change);
      if (message.type === "workspace_changed") {
        const currentWorkspace = useAppStore.getState().workspace;
        if (currentWorkspace) void loadWorkspaceData(currentWorkspace, token);
      }
    };
    socket.onerror = () => setNotice("Live workspace events disconnected", "error");
    return () => socket.close();
    // Events are reconnected when the session token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleExternalChange = async (path: string, change: "changed" | "created" | "deleted") => {
    const current = useAppStore.getState();
    const currentWorkspace = current.workspace;
    markRecent(path);
    const matching = current.tabs.find((tab) => tab.path === path);
    if (!matching || !current.token) { if (currentWorkspace) void refreshDirectory("", current.token); return; }
    try {
      const external = await readFile(matching.path, current.token);
      if (external.binary) return;
      if (isDirty(matching)) updateTab(matching.path, { conflict: { externalContent: external.content } });
      else { updateTab(matching.path, { content: external.content, savedContent: external.content, conflict: undefined }); setNotice(`${matching.name} reloaded from disk`, "info"); }
    } catch {
      if (change === "deleted") updateTab(matching.path, { error: "File deleted on disk" });
      setNotice(change === "deleted" ? `${matching.name} was deleted on disk` : `Could not reload ${matching.name}`, "error");
    }
    if (change !== "changed" && currentWorkspace) void refreshDirectory("", current.token);
  };

  const refreshDirectory = async (path: string, nextToken: string) => {
    try { setDirectory(path, { entries: await listFiles(path, nextToken), loading: false }); } catch { /* The explorer keeps its previous entries when an event races deletion. */ }
  };

  const openFile = async (entry: FileEntry) => {
    if (!token) return;
    setSelected(entry.path);
    setActivePath(entry.path);
    if (tabs.some((tab) => tab.path === entry.path)) return;
    const tab: EditorTab = { path: entry.path, name: entry.name || fileName(entry.path), content: "", savedContent: "", language: language(entry.path) };
    addTab(tab);
    try {
      const result = await readFile(entry.path, token);
      updateTab(entry.path, { content: result.content, savedContent: result.content, binary: result.binary });
    } catch (error) {
      updateTab(entry.path, { error: error instanceof Error ? error.message : "Unable to open file" });
      setNotice(`Could not open ${fileName(entry.path)}`, "error");
    }
  };

  const saveFile = async (tab: EditorTab) => {
    if (!token || tab.binary) return;
    try { await writeFile(tab.path, tab.content, token); updateTab(tab.path, { savedContent: tab.content, conflict: undefined }); setNotice(`${tab.name} saved`, "success"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Save failed", "error"); }
  };

  const openReference = (path: string, line: number, column?: number) => {
    const relativePath = workspace ? workspaceRelativePath(path, workspace.rootPath) : path;
    path = relativePath;
    void openFile({ name: fileName(path), path, type: "file" }).then(() => setPendingLocation({ path, line, column }));
  };

  const refresh = async () => {
    if (!workspace || !token) return;
    await Promise.all(Object.keys(directories).map(async (path) => { try { setDirectory(path, { entries: await listFiles(path, token), loading: false }); } catch { /* Keep the previous tree if one folder disappears. */ } }));
    try { setGit(await getGitStatus(token)); } catch (error) { setNotice(error instanceof Error ? error.message : "Git refresh failed", "error"); }
  };

  const switchToReview = async (restart = false) => {
    setMode("review");
    setReview({ loading: true, url: undefined, message: undefined });
    try { setReview({ ...(await startReview(token, reviewScope, restart)), loading: false }); }
    catch (error) { setReview({ loading: false, available: false, message: error instanceof Error ? error.message : "Review could not start" }); }
  };

  const newTerminal = async (kind: TerminalSession["kind"] = "custom") => {
    if (!token) return;
    try { addTerminal(await createTerminal(kind, token)); if (kind === "lazygit") setTerminalError(undefined); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Terminal could not be started", "error"); }
  };

  const loadedFiles = useMemo(() => Object.values(directories).flatMap((directory) => directory.entries).filter((entry, index, all) => entry.type === "file" && all.findIndex((other) => other.path === entry.path) === index), [directories]);
  const quickResults = (searchResults.length ? searchResults : loadedFiles).filter((entry) => !query || fuzzy(`${entry.name} ${entry.path}`, query)).slice(0, 40);
  const paletteActions: PaletteAction[] = [
    { label: "Open File", shortcut: "⌘ P", run: () => { setPaletteOpen(false); setQuickOpen(true); } },
    { label: "New Terminal", run: () => { setPaletteOpen(false); void newTerminal(); } },
    { label: "Open Agent", run: () => { setPaletteOpen(false); void newTerminal("agent"); } },
    { label: "Open Shell", run: () => { setPaletteOpen(false); void newTerminal("shell"); } },
    { label: "Open Lazygit", run: () => { setPaletteOpen(false); void newTerminal("lazygit"); } },
    { label: "Switch to Edit mode", shortcut: "⌘ 1", run: () => { setMode("edit"); setPaletteOpen(false); } },
    { label: "Switch to Review mode", shortcut: "⌘ 2", run: () => { setPaletteOpen(false); void switchToReview(); } },
    { label: "Save", shortcut: "⌘ S", run: () => { const tab = tabs.find((item) => item.path === activePath); if (tab) void saveFile(tab); setPaletteOpen(false); } },
    { label: "Refresh Git and files", run: () => { setPaletteOpen(false); void refresh(); } },
     { label: "Restart Review", run: () => { setPaletteOpen(false); void switchToReview(true); } },
  ].filter((action) => !query || fuzzy(action.label, query));

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (!command) return;
      if (event.shiftKey && event.key.toLowerCase() === "p") { event.preventDefault(); setPaletteOpen(true); setQuickOpen(false); setQuery(""); }
      else if (!event.shiftKey && event.key.toLowerCase() === "p") { event.preventDefault(); setQuickOpen(true); setPaletteOpen(false); setQuery(""); }
      else if (event.key.toLowerCase() === "s") { event.preventDefault(); const tab = tabs.find((item) => item.path === activePath); if (tab) void saveFile(tab); }
      else if (event.key.toLowerCase() === "j") { event.preventDefault(); useAppStore.setState((state) => ({ terminalCollapsed: !state.terminalCollapsed, terminalMaximized: false })); }
      else if (event.key === "1") setMode("edit");
      else if (event.key === "2") void switchToReview();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
    // Keyboard commands intentionally use current actions from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activePath, token]);

  useEffect(() => {
    if (!quickOpen || !query || !token) { setSearchResults([]); return; }
    const timer = window.setTimeout(() => void searchFiles(query, token).then(setSearchResults).catch(() => setSearchResults([])), 180);
    return () => window.clearTimeout(timer);
  }, [quickOpen, query, token]);

  if (starting) return <main className="boot-screen"><div className="brand-mark">ai<span>ni</span>de</div><span className="loading-line">Connecting to local runtime...</span></main>;
  if (!workspace) return <WorkspacePicker initialPath={localStorage.getItem("ainide:last-workspace") ?? ""} busy={pickerBusy} error={pickerError} onOpen={(path) => {
    setPickerBusy(true); setPickerError(undefined);
    void openWorkspace(path, token).then((next) => loadWorkspaceData(next, token)).catch((error) => setPickerError(error instanceof Error ? error.message : "Could not open workspace")).finally(() => setPickerBusy(false));
  }} />;

  const changedRecently = Object.values(recentChanges).filter((time) => Date.now() - time < 10 * 60 * 1000).length;
  return <div className={`app-shell ${mobileSidebar ? "mobile-sidebar-open" : ""}`}>
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setMobileSidebar(!mobileSidebar)}>☰</button>
      <div className="top-brand">ainide <span>/</span> <b>{workspace.name || fileName(workspace.rootPath)}</b></div>
      <div className="mode-switch" role="tablist"><button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>Edit <kbd>⌘1</kbd></button><button className={mode === "review" ? "active" : ""} onClick={() => void switchToReview()}>Review <kbd>⌘2</kbd></button></div>
       <div className="top-actions"><button className="git-summary" onClick={() => void switchToReview()} title="Open review"><span className="status-pip" />{git?.summary.filesChanged ? <>Review changes <strong>{git.summary.filesChanged} files · +{git.summary.insertions} −{git.summary.deletions}</strong></> : "Working tree clean"}</button><span className="agent-activity" title="Files changed recently"><i /> Agent {changedRecently ? `${changedRecently} change${changedRecently === 1 ? "" : "s"}` : "idle"}</span><button className="command-button" onClick={() => { setPaletteOpen(true); setQuery(""); }}>⌘⇧P <span>Commands</span></button></div>
    </header>
    <div className="workbench">
      <div className="explorer-wrap" style={{ width: explorerWidth }}><Explorer onOpenFile={(entry) => void openFile(entry)} onRefresh={() => void refresh()} /></div>
      <div className="explorer-splitter" onPointerDown={(event) => {
        const move = (e: PointerEvent) => { const width = Math.max(190, Math.min(420, e.clientX)); useAppStore.setState({ explorerWidth: width }); localStorage.setItem("ainide:explorer-width", String(width)); };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); event.preventDefault();
      }} />
      <main className="main-column">
         {mode === "edit" ? <EditorSurface onSave={(tab) => void saveFile(tab)} onOpenFile={(entry) => void openFile(entry)} /> : <ReviewSurface scope={reviewScope} onScopeChange={(scope) => setReview({ scope })} onStart={() => void switchToReview(true)} />}
        <TerminalPanel onNewTerminal={(kind) => void newTerminal(kind)} onOpenReference={openReference} />
      </main>
    </div>
    <div className="notices">{notices.map((notice) => <button className={`notice ${notice.tone}`} key={notice.id} onClick={() => useAppStore.getState().dismissNotice(notice.id)}>{notice.text}<span>×</span></button>)}</div>
    {terminalError && <div className="terminal-error-toast"><b>Terminal note</b> {terminalError}</div>}
    {(paletteOpen || quickOpen) && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) { setPaletteOpen(false); setQuickOpen(false); } }}>
      <div className="command-modal">
        <div className="command-input"><span>{quickOpen ? "⌕" : "⌘"}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={quickOpen ? "Search files..." : "Type a command..."} onKeyDown={(event) => { if (event.key === "Escape") { setQuickOpen(false); setPaletteOpen(false); } }} /></div>
        <div className="command-list">{quickOpen ? (quickResults.length ? quickResults.map((entry) => <button key={entry.path} onClick={() => { setQuickOpen(false); void openFile(entry); }}>{entry.name}<small>{entry.path}</small></button>) : <div className="command-empty">No loaded files match. Expand folders in the explorer to index them.</div>) : (paletteActions.length ? paletteActions.map((action) => <button key={action.label} onClick={action.run}><span>{action.label}</span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>) : <div className="command-empty">No commands match.</div>)}</div>
      </div>
    </div>}
  </div>;
}

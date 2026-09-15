import Editor, { DiffEditor, type OnMount } from "@monaco-editor/react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { language } from "../file-language";
import type { InspectionReturnLocation } from "../inspection-navigation";
import { diffLines } from "../line-diff";
import { configureMonacoLanguageSurface } from "../monaco-language-surface";
import type { AnnotationAnchor } from "../annotation-anchor";
import { editorCursorAnchor, editorSelectionAnchor } from "../annotation-anchor";
import type { CodeSelection } from "../references";
import { gitComparisonKey, isDirty, useAppStore } from "../store";
import type { EditorPaneId, EditorPaneState, EditorTab, GitComparisonState } from "../types";
import { InspectionReturnBar } from "./InspectionReturnBar";

interface EditorProps {
  onContentChange: (path: string, content: string) => void;
  onReturnFromInspection?: (location: InspectionReturnLocation) => void;
  flushAutoSave: (path: string) => Promise<void>;
  cancelAutoSave: (path: string) => void;
  onCopySelection: (tab: EditorTab, selection: CodeSelection) => void;
  onAddSelectionToKit: (tab: EditorTab, selection: CodeSelection, anchor?: AnnotationAnchor) => void;
  onCopyFile: (tab: EditorTab) => void;
  onAddFileToKit: (tab: EditorTab, anchor?: AnnotationAnchor) => void;
}

interface DraggedTab {
  paneId: EditorPaneId;
  path: string;
}

function comparisonMessage(status: GitComparisonState | undefined): string | undefined {
  if (!status) return undefined;
  if (status.status === "loading") return "Loading Git baseline...";
  if (status.status === "error") return "Git comparison unavailable";
  if (status.status === "unavailable") {
    switch (status.reason) {
      case "non-repository": return "Git baseline unavailable · not a repository";
      case "no-head": return "Git baseline unavailable · no committed HEAD";
      case "binary": return "Text comparison unavailable · binary file";
      case "conflict": return "Text comparison unavailable · unresolved conflict";
      default: return "Git baseline unavailable";
    }
  }
  if (status.comparison.status === "clean") return "Git clean";
  if (status.comparison.status === "untracked") return "Untracked · empty baseline";
  if (status.comparison.status === "deleted") return "Deleted · HEAD baseline";
  if (status.comparison.status === "renamed" && status.comparison.previousPath) return `Renamed from ${status.comparison.previousPath}`;
  return `Git ${status.comparison.status}`;
}

interface GitDiffViewProps {
  paneId: EditorPaneId;
  tab: EditorTab;
  comparison: Extract<GitComparisonState, { status: "ready" }>;
  onClose: () => void;
}

function GitDiffView({ paneId, tab, comparison, onClose }: GitDiffViewProps) {
  const baseline = comparison.comparison.content ?? "";
  const current = comparison.comparison.status === "deleted" ? "" : tab.content;
  const clean = baseline === current;
  const currentLabel = comparison.comparison.status === "deleted" ? "CURRENT BUFFER · DELETED" : `CURRENT BUFFER${isDirty(tab) ? " · UNSAVED" : ""}`;

  return <div className="git-diff-view">
    <div className="git-diff-header">
      <div className="git-diff-heading"><span className="eyebrow">FILE COMPARISON</span><strong>{tab.path}</strong></div>
      <button type="button" className="split-control" onClick={onClose}>Close Git diff</button>
    </div>
    {clean ? <div className="git-diff-clean"><span className="state-icon">✓</span><h2>No file changes</h2><p>The current buffer matches the committed HEAD baseline.</p></div> : <>
      <div className="git-diff-labels"><span><b>HEAD</b>{comparison.comparison.previousPath && <small>{comparison.comparison.previousPath}</small>}</span><span><b>{currentLabel}</b><small>{tab.path}</small></span></div>
      <div className="git-diff-editor"><DiffEditor
        original={baseline}
        modified={current}
        language={tab.language}
        theme="vs-dark"
        originalModelPath={`ainide-git-head://${paneId}/${tab.path}`}
        modifiedModelPath={`ainide-git-buffer://${paneId}/${tab.path}`}
        options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, readOnly: true, originalEditable: false, renderSideBySide: true, scrollBeyondLastLine: false }}
      /></div>
    </>}
  </div>;
}

function readDraggedTab(event: DragEvent<HTMLElement>): DraggedTab | undefined {
  try {
    const value = JSON.parse(event.dataTransfer.getData("application/x-ainide-tab")) as Partial<DraggedTab>;
    if ((value.paneId === "primary" || value.paneId === "secondary") && typeof value.path === "string") return value as DraggedTab;
  } catch { /* Ignore drops that did not originate from an editor tab. */ }
  return undefined;
}

function tabIndexAt(event: DragEvent<HTMLElement>, tabs: EditorTab[]): number {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tab-index]");
  if (!target) return tabs.length;
  const index = Number(target.dataset.tabIndex);
  if (!Number.isInteger(index)) return tabs.length;
  const rectangle = target.getBoundingClientRect();
  return index + (event.clientX >= rectangle.left + rectangle.width / 2 ? 1 : 0);
}

interface EditorPaneProps {
  paneId: EditorPaneId;
  pane: EditorPaneState;
  tabs: EditorTab[];
  secondaryOpen: boolean;
  onContentChange: (path: string, content: string) => void;
  flushAutoSave: (path: string) => Promise<void>;
  cancelAutoSave: (path: string) => void;
  onCopySelection: (tab: EditorTab, selection: CodeSelection) => void;
  onAddSelectionToKit: (tab: EditorTab, selection: CodeSelection, anchor?: AnnotationAnchor) => void;
  onCopyFile: (tab: EditorTab) => void;
  onAddFileToKit: (tab: EditorTab, anchor?: AnnotationAnchor) => void;
}

function EditorPane({ paneId, pane, tabs, secondaryOpen, onContentChange, flushAutoSave, cancelAutoSave, onCopySelection, onAddSelectionToKit, onCopyFile, onAddFileToKit }: EditorPaneProps) {
  const active = tabs.find((tab) => tab.path === pane.activePath);
  const focusedPaneId = useAppStore((state) => state.focusedPaneId);
  const updateTab = useAppStore((state) => state.updateTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const setActivePath = useAppStore((state) => state.setActivePath);
  const setFocusedPane = useAppStore((state) => state.setFocusedPane);
  const moveTab = useAppStore((state) => state.moveTab);
  const closeSecondary = useAppStore((state) => state.closeSecondary);
  const pendingLocation = useAppStore((state) => state.pendingLocation);
  const setPendingLocation = useAppStore((state) => state.setPendingLocation);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const gitHead = useAppStore((state) => state.git?.head);
  const gitComparison = useAppStore((state) => activeProjectId && active ? state.gitComparisons[gitComparisonKey(activeProjectId, active.path, gitHead)] : undefined);
  const [compare, setCompare] = useState(false);
  const [gitDiffOpen, setGitDiffOpen] = useState(false);
  const [draggingPath, setDraggingPath] = useState<string>();
  const [dropIndex, setDropIndex] = useState<number>();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const editorPathRef = useRef<string>();
  const decorationIdsRef = useRef<string[]>([]);
  const previousPathRef = useRef<string>();

  const focusPane = () => setFocusedPane(paneId);

  const mount: OnMount = (editor) => {
    editorRef.current = editor;
    editorPathRef.current = active?.path;
    focusPane();
    editor.onDidFocusEditorText(focusPane);
    editor.onDidFocusEditorWidget(focusPane);
    editor.addAction({ id: `ainide.goto-line-${paneId}`, label: "Go to Line", keybindings: [], run: () => {
      const line = window.prompt("Go to line");
      const number = Number(line);
      if (Number.isInteger(number) && number > 0) editor.revealLineInCenter(number);
    } });
    const activeTab = (): EditorTab | undefined => {
      const path = editorPathRef.current;
      if (!path) return undefined;
      return useAppStore.getState().tabs.find((tab) => tab.path === path);
    };
    editor.addAction({
      id: `ainide.copy-selection-ref-${paneId}`,
      label: "Copy as reference",
      contextMenuGroupId: "ainide",
      contextMenuOrder: 1,
      precondition: "editorHasSelection",
      run: () => {
        const tab = activeTab();
        const value = selection();
        if (tab && value) onCopySelection(tab, value);
      },
    });
    editor.addAction({
      id: `ainide.add-selection-kit-${paneId}`,
      label: "Add selection to kit",
      contextMenuGroupId: "ainide",
      contextMenuOrder: 2,
      precondition: "editorHasSelection",
      run: () => {
        const tab = activeTab();
        const value = selection();
        const editor = editorRef.current;
        if (tab && value) onAddSelectionToKit(tab, value, editor ? editorSelectionAnchor(editor) : undefined);
      },
    });
    editor.addAction({
      id: `ainide.copy-file-ref-${paneId}`,
      label: "Copy file as reference",
      contextMenuGroupId: "ainide",
      contextMenuOrder: 3,
      run: () => {
        const tab = activeTab();
        if (tab) onCopyFile(tab);
      },
    });
    editor.addAction({
      id: `ainide.add-file-kit-${paneId}`,
      label: "Add file to kit",
      contextMenuGroupId: "ainide",
      contextMenuOrder: 4,
      run: () => {
        const tab = activeTab();
        const editor = editorRef.current;
        if (tab) onAddFileToKit(tab, editor ? editorCursorAnchor(editor) : undefined);
      },
    });
  };

  useEffect(() => {
    if (previousPathRef.current !== undefined && previousPathRef.current !== active?.path) setGitDiffOpen(false);
    previousPathRef.current = active?.path;
  }, [active?.path]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const clearDecorations = () => {
      if (!decorationIdsRef.current.length) return;
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
    };
    const ready = gitComparison?.status === "ready" ? gitComparison : undefined;
    if (!active || active.binary || active.error || ready?.comparison.status === "deleted") {
      clearDecorations();
      return clearDecorations;
    }
    const ranges = ready ? diffLines(ready.comparison.content ?? "", active.content) : [];
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, ranges.map((range) => ({
      range: { startLineNumber: range.startLine, startColumn: 1, endLineNumber: range.endLine, endColumn: 1 },
      options: {
        isWholeLine: range.kind !== "deletion",
        linesDecorationsClassName: `ainide-git-${range.kind}`,
        glyphMarginClassName: `ainide-git-glyph-${range.kind}`,
      },
    })));
    return clearDecorations;
  }, [active, active?.content, active?.error, active?.binary, gitComparison]);

  useEffect(() => {
    const location = pendingLocation;
    if (!location || location.paneId !== paneId || location.path !== pane.activePath || editorPathRef.current !== pane.activePath || !editorRef.current || !active || active.binary || active.error) return;
    editorRef.current.revealPositionInCenter({ lineNumber: location.line, column: location.column ?? 1 });
    editorRef.current.setPosition({ lineNumber: location.line, column: location.column ?? 1 });
    setPendingLocation(undefined);
  }, [active, pane.activePath, paneId, pendingLocation, setPendingLocation]);

  useEffect(() => {
    const clear = () => {
      setDraggingPath(undefined);
      setDropIndex(undefined);
    };
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, []);

  const close = async (path: string) => {
    await flushAutoSave(path);
    const tab = useAppStore.getState().tabs.find((item) => item.path === path);
    if (tab && isDirty(tab) && !window.confirm(`Discard changes to ${tab.name}?`)) return;
    cancelAutoSave(path);
    closeTab(paneId, path);
  };

  const startDrag = (event: DragEvent<HTMLDivElement>, path: string) => {
    focusPane();
    setDraggingPath(path);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-ainide-tab", JSON.stringify({ paneId, path } satisfies DraggedTab));
    event.dataTransfer.setData("text/plain", path);
  };

  const dragOverTabs = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndex(tabIndexAt(event, tabs));
  };

  const dropTab = (event: DragEvent<HTMLElement>, fallbackIndex = tabs.length) => {
    event.preventDefault();
    event.stopPropagation();
    const dragged = readDraggedTab(event);
    if (dragged) moveTab(dragged.paneId, paneId, dragged.path, dropIndex ?? fallbackIndex);
    setDraggingPath(undefined);
    setDropIndex(undefined);
  };

  const clearDrag = () => {
    setDraggingPath(undefined);
    setDropIndex(undefined);
  };

  const selection = (): CodeSelection | undefined => {
    const value = editorRef.current?.getSelection();
    if (!value || value.isEmpty()) return undefined;
    return { startLineNumber: value.startLineNumber, endLineNumber: value.endLineNumber };
  };

  const readyComparison = gitComparison?.status === "ready" ? gitComparison : undefined;
  const canOpenGitDiff = Boolean(readyComparison && (!active?.error || readyComparison.comparison.status === "deleted"));
  const gitStatusText = comparisonMessage(gitComparison);

  return (
    <section
      className={`editor-pane ${focusedPaneId === paneId ? "focused" : ""}`}
      aria-label={`${paneId === "primary" ? "Primary" : "Secondary"} editor`}
      onPointerDown={focusPane}
      onDragOver={(event) => {
        if (!(event.target as HTMLElement).closest(".tabs")) dragOverTabs(event);
      }}
      onDrop={(event) => dropTab(event)}
    >
      <div className="pane-tab-row">
        <div className={`tabs ${dropIndex === tabs.length && draggingPath ? "drop-end" : ""}`} role="tablist" aria-label={`${paneId === "primary" ? "Primary" : "Secondary"} editor tabs`} onDragOver={dragOverTabs} onDrop={(event) => dropTab(event)}>
          {tabs.map((tab, index) => (
            /* Tab drag is a pointer-only convenience; tabs reachable via keyboard */
            /* biome-ignore lint/a11y/noStaticElementInteractions: drag handles are supplementary pointer affordances */
            <div className={`editor-tab ${tab.path === pane.activePath ? "active" : ""} ${draggingPath === tab.path ? "dragging" : ""} ${dropIndex === index && draggingPath ? "drop-before" : ""}`} data-tab-index={index} key={tab.path} draggable onDragStart={(event) => startDrag(event, tab.path)} onDragEnd={clearDrag}>
              <button type="button" role="tab" aria-selected={tab.path === pane.activePath} onClick={(event) => {
                focusPane();
                if (event.shiftKey) { void close(tab.path); return; }
                setActivePath(paneId, tab.path);
              }} title={`${tab.path} · Shift-click to close`}>
                <span className="tab-language">{tab.language === "plaintext" ? "·" : "◆"}</span>{tab.name}{isDirty(tab) && <span className="dirty-dot" />}
              </button>
              <button type="button" className="tab-close" onClick={() => void close(tab.path)} aria-label={`Close ${tab.name}`}>×</button>
            </div>
          ))}
          {tabs.length > 0 && <div className="tab-spacer" />}
        </div>
        {paneId === "secondary" && <button type="button" className="split-control" onClick={closeSecondary} title="Close split">Close split</button>}
        {paneId === "primary" && !secondaryOpen && <button type="button" className="split-control" onClick={() => useAppStore.getState().openSecondary()} title="Open split">Split</button>}
      </div>
      {active ? (
        /* Drop-zone drag is a pointer-only convenience; files open via explorer/quick-open */
        /* biome-ignore lint/a11y/noStaticElementInteractions: drop target is a supplementary pointer affordance */
        <div className="editor-content" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropIndex(tabs.length); }} onDrop={(event) => dropTab(event)}>
          {active.conflict && (
            <div className="conflict-banner">
              <span><b>External change</b> · {active.name} changed on disk while you were editing.</span>
              <span className="conflict-actions">
                <button type="button" onClick={() => updateTab(active.path, { content: active.conflict?.externalContent ?? active.content, savedContent: active.conflict?.externalContent ?? active.content, conflict: undefined })}>Reload</button>
                <button type="button" onClick={() => updateTab(active.path, { conflict: undefined })}>Keep mine</button>
                <button type="button" onClick={() => setCompare(!compare)}>{compare ? "Close compare" : "Compare"}</button>
              </span>
            </div>
          )}
          {gitDiffOpen && canOpenGitDiff && readyComparison ? <GitDiffView paneId={paneId} tab={active} comparison={readyComparison} onClose={() => setGitDiffOpen(false)} /> : active.error ? <div className="file-state"><span className="state-icon">!</span><h2>Could not open file</h2><p>{active.error}</p>{canOpenGitDiff && <button type="button" className="primary-button" onClick={() => setGitDiffOpen(true)}>View Git diff</button>}</div> : active.binary ? <div className="file-state"><span className="state-icon">◈</span><h2>Binary file</h2><p>ainide does not edit binary files.</p></div> : (
            <>
              <div className="editor-toolbar"><span>{active.path}</span><span className="editor-actions">{gitStatusText && <span className={`git-comparison-status ${gitComparison?.status === "unavailable" ? "unavailable" : ""}`}>{gitStatusText}</span>}{canOpenGitDiff && <button type="button" onClick={() => setGitDiffOpen(true)}>Git diff</button>}<button type="button" onClick={() => editorRef.current?.trigger("keyboard", "actions.find", null)}>Find</button><button type="button" onClick={() => editorRef.current?.trigger("keyboard", "editor.action.gotoLine", null)}>Go to line</button></span></div>
              {compare && active.conflict?.externalContent !== undefined && <div className="compare-panel"><div><span className="compare-label">YOUR BUFFER</span><pre>{active.content}</pre></div><div><span className="compare-label">ON DISK</span><pre>{active.conflict.externalContent}</pre></div></div>}
              <Editor key={active.path} path={active.path} theme="vs-dark" language={active.language} value={active.content} saveViewState beforeMount={configureMonacoLanguageSurface} onMount={mount} onChange={(value) => onContentChange(active.path, value ?? "")} options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: "on", glyphMargin: true, padding: { top: 10 }, scrollBeyondLastLine: false, renderWhitespace: "selection", smoothScrolling: true }} />
            </>
          )}
        </div>
      ) : <div className="empty-editor"><div className="empty-glyph">⌘</div><h2>{paneId === "secondary" ? "Second editor ready." : "Ready when you are."}</h2><p>{paneId === "secondary" ? "Shift-click a file or drag a tab here." : <>Open a file from the explorer or use <kbd>⌘ P</kbd> to search.</>}</p></div>}
    </section>
  );
}

export function EditorSurface({ onContentChange, onReturnFromInspection, flushAutoSave, cancelAutoSave, onCopySelection, onAddSelectionToKit, onCopyFile, onAddFileToKit }: EditorProps) {
  const tabs = useAppStore((state) => state.tabs);
  const panes = useAppStore((state) => state.panes);
  const secondaryOpen = useAppStore((state) => state.secondaryOpen);
  const paneIds: EditorPaneId[] = secondaryOpen ? ["primary", "secondary"] : ["primary"];
  const paneProps = { onContentChange, flushAutoSave, cancelAutoSave, onCopySelection, onAddSelectionToKit, onCopyFile, onAddFileToKit, secondaryOpen };

  return <section className={`editor-area ${secondaryOpen ? "split" : ""}`}>
    {onReturnFromInspection && <InspectionReturnBar onReturn={onReturnFromInspection} />}
    <div className="editor-layout">
      {paneIds.map((paneId, index) => <div className="editor-pane-slot" key={paneId}>
        {index > 0 && <div className="editor-divider" aria-hidden="true" />}
        <EditorPane paneId={paneId} pane={panes[paneId]} tabs={panes[paneId].tabPaths.map((path) => tabs.find((tab) => tab.path === path)).filter((tab): tab is EditorTab => Boolean(tab))} {...paneProps} />
      </div>)}
    </div>
  </section>;
}

export { language };

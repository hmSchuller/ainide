import { useEffect, useRef, useState, type DragEvent } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { EditorTab, EditorPaneId, EditorPaneState } from "../types";
import { isDirty, useAppStore } from "../store";

interface EditorProps {
  onSave: (tab: EditorTab) => void;
}

const languageByExtension: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", json: "json", css: "css", scss: "scss",
  html: "html", md: "markdown", py: "python", rs: "rust", go: "go", java: "java", sh: "shell", yml: "yaml", yaml: "yaml",
};

function language(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return languageByExtension[extension] ?? "plaintext";
}

interface DraggedTab {
  paneId: EditorPaneId;
  path: string;
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
  onSave: (tab: EditorTab) => void;
}

function EditorPane({ paneId, pane, tabs, secondaryOpen, onSave }: EditorPaneProps) {
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
  const [compare, setCompare] = useState(false);
  const [draggingPath, setDraggingPath] = useState<string>();
  const [dropIndex, setDropIndex] = useState<number>();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const editorPathRef = useRef<string>();

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
  };

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

  const close = (path: string) => {
    const tab = tabs.find((item) => item.path === path);
    if (tab && isDirty(tab) && !window.confirm(`Discard changes to ${tab.name}?`)) return;
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
            <div className={`editor-tab ${tab.path === pane.activePath ? "active" : ""} ${draggingPath === tab.path ? "dragging" : ""} ${dropIndex === index && draggingPath ? "drop-before" : ""}`} data-tab-index={index} key={tab.path} draggable onDragStart={(event) => startDrag(event, tab.path)} onDragEnd={clearDrag}>
              <button role="tab" aria-selected={tab.path === pane.activePath} onClick={() => { focusPane(); setActivePath(paneId, tab.path); }} title={tab.path}>
                <span className="tab-language">{tab.language === "plaintext" ? "·" : "◆"}</span>{tab.name}{isDirty(tab) && <span className="dirty-dot" />}
              </button>
              <button className="tab-close" onClick={() => close(tab.path)} aria-label={`Close ${tab.name}`}>×</button>
            </div>
          ))}
          {tabs.length > 0 && <div className="tab-spacer" />}
        </div>
        {paneId === "secondary" && <button className="split-control" onClick={closeSecondary} title="Close split">Close split</button>}
        {paneId === "primary" && !secondaryOpen && <button className="split-control" onClick={() => useAppStore.getState().openSecondary()} title="Open split">Split</button>}
      </div>
      {active ? (
        <div className="editor-content" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropIndex(tabs.length); }} onDrop={(event) => dropTab(event)}>
          {active.conflict && (
            <div className="conflict-banner">
              <span><b>External change</b> · {active.name} changed on disk while you were editing.</span>
              <span className="conflict-actions">
                <button onClick={() => updateTab(active.path, { content: active.conflict?.externalContent ?? active.content, savedContent: active.conflict?.externalContent ?? active.content, conflict: undefined })}>Reload</button>
                <button onClick={() => updateTab(active.path, { conflict: undefined })}>Keep mine</button>
                <button onClick={() => setCompare(!compare)}>{compare ? "Close compare" : "Compare"}</button>
              </span>
            </div>
          )}
          {active.error ? <div className="file-state"><span className="state-icon">!</span><h2>Could not open file</h2><p>{active.error}</p></div> : active.binary ? <div className="file-state"><span className="state-icon">◈</span><h2>Binary file</h2><p>ainide does not edit binary files.</p></div> : (
            <>
              <div className="editor-toolbar"><span>{active.path}</span><span className="editor-actions"><button onClick={() => editorRef.current?.trigger("keyboard", "actions.find", null)}>Find</button><button onClick={() => editorRef.current?.trigger("keyboard", "editor.action.gotoLine", null)}>Go to line</button><button className="save-mini" onClick={() => onSave(active)}>Save</button></span></div>
              {compare && active.conflict?.externalContent !== undefined && <div className="compare-panel"><div><label>YOUR BUFFER</label><pre>{active.content}</pre></div><div><label>ON DISK</label><pre>{active.conflict.externalContent}</pre></div></div>}
              <Editor key={active.path} path={active.path} theme="vs-dark" language={active.language} value={active.content} saveViewState onMount={mount} onChange={(value) => updateTab(active.path, { content: value ?? "" })} options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: "on", padding: { top: 10 }, scrollBeyondLastLine: false, renderWhitespace: "selection", smoothScrolling: true }} />
            </>
          )}
        </div>
      ) : <div className="empty-editor"><div className="empty-glyph">⌘</div><h2>{paneId === "secondary" ? "Second editor ready." : "Ready when you are."}</h2><p>{paneId === "secondary" ? "Shift-click a file or drag a tab here." : <>Open a file from the explorer or use <kbd>⌘ P</kbd> to search.</>}</p></div>}
    </section>
  );
}

export function EditorSurface({ onSave }: EditorProps) {
  const tabs = useAppStore((state) => state.tabs);
  const panes = useAppStore((state) => state.panes);
  const secondaryOpen = useAppStore((state) => state.secondaryOpen);
  const paneIds: EditorPaneId[] = secondaryOpen ? ["primary", "secondary"] : ["primary"];

  return <section className={`editor-area ${secondaryOpen ? "split" : ""}`}>
    <div className="editor-layout">
      {paneIds.map((paneId, index) => <div className="editor-pane-slot" key={paneId}>
        {index > 0 && <div className="editor-divider" aria-hidden="true" />}
        <EditorPane paneId={paneId} pane={panes[paneId]} tabs={panes[paneId].tabPaths.map((path) => tabs.find((tab) => tab.path === path)).filter((tab): tab is EditorTab => Boolean(tab))} secondaryOpen={secondaryOpen} onSave={onSave} />
      </div>)}
    </div>
  </section>;
}

export { language };

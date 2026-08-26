import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { FileEntry } from "@ainide/shared";
import type { EditorTab } from "../types";
import { isDirty, useAppStore } from "../store";

interface EditorProps {
  onSave: (tab: EditorTab) => void;
  onOpenFile: (entry: FileEntry) => void;
}

const languageByExtension: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", json: "json", css: "css", scss: "scss",
  html: "html", md: "markdown", py: "python", rs: "rust", go: "go", java: "java", sh: "shell", yml: "yaml", yaml: "yaml",
};

function language(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return languageByExtension[extension] ?? "plaintext";
}

export function EditorSurface({ onSave }: EditorProps) {
  const tabs = useAppStore((state) => state.tabs);
  const activePath = useAppStore((state) => state.activePath);
  const active = tabs.find((tab) => tab.path === activePath);
  const updateTab = useAppStore((state) => state.updateTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const setActivePath = useAppStore((state) => state.setActivePath);
  const pendingLocation = useAppStore((state) => state.pendingLocation);
  const setPendingLocation = useAppStore((state) => state.setPendingLocation);
  const [compare, setCompare] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const mount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addAction({ id: "ainide.goto-line", label: "Go to Line", keybindings: [], run: () => {
      const line = window.prompt("Go to line");
      const number = Number(line);
      if (Number.isInteger(number) && number > 0) editor.revealLineInCenter(number);
    } });
  };

  useEffect(() => {
    const location = pendingLocation;
    if (!location || !editorRef.current || location.path !== activePath) return;
    if (editorRef.current) {
      editorRef.current.revealPositionInCenter({ lineNumber: location.line, column: location.column ?? 1 });
      editorRef.current.setPosition({ lineNumber: location.line, column: location.column ?? 1 });
      setPendingLocation(undefined);
    }
  }, [activePath, pendingLocation, setPendingLocation]);

  const close = (path: string) => {
    const tab = tabs.find((item) => item.path === path);
    if (tab && isDirty(tab) && !window.confirm(`Discard changes to ${tab.name}?`)) return;
    closeTab(path);
  };

  return (
    <section className="editor-area">
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <div className={`editor-tab ${tab.path === activePath ? "active" : ""}`} key={tab.path}>
            <button role="tab" onClick={() => setActivePath(tab.path)} title={tab.path}>
              <span className="tab-language">{tab.language === "plaintext" ? "·" : "◆"}</span>{tab.name}{isDirty(tab) && <span className="dirty-dot" />}
            </button>
            <button className="tab-close" onClick={() => close(tab.path)} aria-label={`Close ${tab.name}`}>×</button>
          </div>
        ))}
        {tabs.length > 0 && <div className="tab-spacer" />}
      </div>
      {active ? (
        <div className="editor-content">
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
              <Editor theme="vs-dark" language={active.language} value={active.content} onMount={mount} onChange={(value) => updateTab(active.path, { content: value ?? "" })} options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: "on", padding: { top: 10 }, scrollBeyondLastLine: false, renderWhitespace: "selection", smoothScrolling: true }} />
            </>
          )}
        </div>
      ) : <div className="empty-editor"><div className="empty-glyph">⌘</div><h2>Ready when you are.</h2><p>Open a file from the explorer or use <kbd>⌘ P</kbd> to search.</p></div>}
    </section>
  );
}

export { language };

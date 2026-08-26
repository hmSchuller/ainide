import { useState } from "react";

interface WorkspacePickerProps {
  initialPath?: string;
  busy: boolean;
  error?: string;
  onOpen: (path: string) => void;
}

export function WorkspacePicker({ initialPath = "", busy, error, onOpen }: WorkspacePickerProps) {
  const [path, setPath] = useState(initialPath);
  const [validationError, setValidationError] = useState<string>();

  const submit = () => {
    const value = path.trim();
    if (!value) { setValidationError("Enter the absolute path to a workspace directory."); return; }
    if (!value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value)) { setValidationError("Workspace paths must be absolute (for example, /Users/you/project)."); return; }
    setValidationError(undefined);
    onOpen(value);
  };

  return (
    <main className="picker-screen">
      <section className="picker-card">
        <div className="brand-mark">ai<span>ni</span>de</div>
        <p className="eyebrow">LOCAL DEVELOPER COCKPIT</p>
        <h1>Choose a workspace</h1>
        <p className="muted picker-copy">Open a local project to edit, inspect Git, and run its tools. Nothing leaves this machine.</p>
        <label className="field-label" htmlFor="workspace-path">Absolute directory</label>
        <div className="path-entry">
          <span className="path-prefix">~/</span>
          <input
            id="workspace-path"
            list="recent-workspaces"
            autoFocus
            value={path}
            onChange={(event) => { setPath(event.target.value); setValidationError(undefined); }}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            placeholder="/Users/you/src/project"
            spellCheck={false}
          />
          <datalist id="recent-workspaces"><option value={initialPath} /></datalist>
        </div>
        {(error || validationError) && <div className="error-box">{error ?? validationError}</div>}
        <button className="primary-button open-button" onClick={submit} disabled={busy || !path.trim()}>
          {busy ? "Opening workspace..." : "Open workspace"}
          <span>↵</span>
        </button>
        <p className="picker-hint">Use an absolute path. The server validates that it is a directory.</p>
      </section>
    </main>
  );
}

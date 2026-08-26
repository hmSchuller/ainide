import { useState } from "react";
import type { ProjectRef } from "@ainide/shared";

interface WorkspacePickerProps {
  initialPath?: string;
  knownProjects?: ProjectRef[];
  busy: boolean;
  error?: string;
  onOpen: (path: string) => void;
}

export function WorkspacePicker({ initialPath = "", knownProjects = [], busy, error, onOpen }: WorkspacePickerProps) {
  const [path, setPath] = useState(initialPath);
  const [validationError, setValidationError] = useState<string>();

  const submit = (value = path) => {
    const next = value.trim();
    if (!next) { setValidationError("Enter the absolute path to a workspace directory."); return; }
    if (!next.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(next)) { setValidationError("Workspace paths must be absolute (for example, /Users/you/project)."); return; }
    setValidationError(undefined);
    onOpen(next);
  };

  return (
    <main className="picker-screen">
      <section className="picker-card">
        <div className="brand-mark">ai<span>ni</span>de</div>
        <p className="eyebrow">LOCAL DEVELOPER COCKPIT</p>
        <h1>Choose a workspace</h1>
        <p className="muted picker-copy">Open a local project to edit, inspect Git, and run its tools. Nothing leaves this machine.</p>
        {knownProjects.length > 0 && (
          <div className="known-projects">
            <span className="field-label">Known projects</span>
            {knownProjects.map((project) => (
              <button key={project.projectId} className="known-project" type="button" onClick={() => submit(project.rootPath)} disabled={busy}>
                {project.name}
                <small>{project.rootPath}</small>
              </button>
            ))}
          </div>
        )}
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
          <datalist id="recent-workspaces">
            {knownProjects.map((project) => <option key={project.projectId} value={project.rootPath} />)}
            {initialPath && <option value={initialPath} />}
          </datalist>
        </div>
        {(error || validationError) && <div className="error-box">{error ?? validationError}</div>}
        <button className="primary-button open-button" onClick={() => submit()} disabled={busy || !path.trim()}>
          {busy ? "Opening workspace..." : "Open workspace"}
          <span>↵</span>
        </button>
        <p className="picker-hint">Use an absolute path. The server validates that it is a directory.</p>
      </section>
    </main>
  );
}

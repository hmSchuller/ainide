import { useEffect, useRef, useState, type ChangeEventHandler, type KeyboardEventHandler } from "react";
import type { ProjectRef, WorkspaceDirectoryChild } from "@ainide/shared";
import { getWorkspaceDirectoryChildren } from "../api";
import { displayWorkspacePath, isAbsoluteWorkspacePath, workspacePathCompletion } from "../workspace-path";

export interface WorkspacePickerProps {
  token?: string;
  recentProjects?: ProjectRef[];
  busy: boolean;
  error?: string;
  onOpen: (path: string) => void;
}

function pathKey(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "") || "/";
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("//") ? normalized.toLowerCase() : normalized;
}

export interface WorkspacePickerManualEntryProps {
  path: string;
  suggestions: WorkspaceDirectoryChild[];
  activeSuggestion: number;
  pathError?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onSuggestionSelect: (path: string) => void;
}

export function WorkspacePickerManualEntry({
  path,
  suggestions,
  activeSuggestion,
  pathError,
  onChange,
  onKeyDown,
  onSuggestionSelect,
}: WorkspacePickerManualEntryProps) {
  return (
    <div className="picker-manual-entry">
      <label className="field-label" htmlFor="workspace-path">Directory path</label>
      <div className="path-entry picker-path-entry">
        <input
          id="workspace-path"
          autoFocus
          role="combobox"
          aria-autocomplete="list"
          aria-controls="workspace-path-suggestions"
          aria-expanded={suggestions.length > 0}
          aria-activedescendant={activeSuggestion >= 0 ? `workspace-path-suggestion-${activeSuggestion}` : undefined}
          value={path}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="~/src/project or /Users/you/src/project"
          spellCheck={false}
        />
        {suggestions.length > 0 && (
          <ul id="workspace-path-suggestions" className="picker-suggestions" role="listbox" aria-label="Directory suggestions">
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.path} id={`workspace-path-suggestion-${index}`} role="option" aria-selected={index === activeSuggestion}>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onSuggestionSelect(suggestion.path)}>{suggestion.name}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pathError && <div className="error-box">{pathError}</div>}
    </div>
  );
}

export function WorkspacePicker({ token, recentProjects = [], busy, error, onOpen }: WorkspacePickerProps) {
  const [path, setPath] = useState("~");
  const [currentPath, setCurrentPath] = useState("~");
  const [parentPath, setParentPath] = useState<string>();
  const [homePath, setHomePath] = useState<string>();
  const [children, setChildren] = useState<WorkspaceDirectoryChild[]>([]);
  const [suggestions, setSuggestions] = useState<WorkspaceDirectoryChild[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string>();
  const [suggestionError, setSuggestionError] = useState<string>();
  const [validationError, setValidationError] = useState<string>();
  const browseGeneration = useRef(0);
  const suggestionGeneration = useRef(0);
  const suppressSuggestions = useRef(false);

  const loadDirectory = async (requestedPath: string) => {
    const generation = ++browseGeneration.current;
    ++suggestionGeneration.current;
    suppressSuggestions.current = true;
    setPath(displayWorkspacePath(requestedPath, homePath));
    setCurrentPath(requestedPath);
    setChildren([]);
    setSuggestions([]);
    setActiveSuggestion(-1);
    setBrowseError(undefined);
    setLoading(true);
    if (!token) {
      if (generation === browseGeneration.current) {
        setLoading(false);
        setBrowseError("Directory browsing is unavailable until the session is authenticated.");
      }
      return;
    }
    try {
      const result = await getWorkspaceDirectoryChildren(requestedPath, token);
      if (generation !== browseGeneration.current) return;
      setCurrentPath(result.currentPath);
      setParentPath(result.parentPath);
      setHomePath(result.homePath);
      setPath(displayWorkspacePath(result.currentPath, result.homePath));
      setChildren(result.children);
    } catch (loadError) {
      if (generation === browseGeneration.current) {
        setBrowseError(loadError instanceof Error ? loadError.message : "Could not load directory children");
      }
    } finally {
      if (generation === browseGeneration.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadDirectory("~");
    return () => {
      ++browseGeneration.current;
      ++suggestionGeneration.current;
    };
    // A picker mount is a new browsing session. Its token is the only input that can change
    // while the session is alive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const generation = ++suggestionGeneration.current;
    setActiveSuggestion(-1);
    if (suppressSuggestions.current) {
      suppressSuggestions.current = false;
      setSuggestions([]);
      return;
    }
    const completion = workspacePathCompletion(path);
    if (!completion || !token) {
      setSuggestions([]);
      setSuggestionError(undefined);
      return;
    }
    const timer = window.setTimeout(() => {
        void getWorkspaceDirectoryChildren(completion.parentPath, token, completion.query)
        .then((result) => {
          if (generation !== suggestionGeneration.current) return;
          setHomePath(result.homePath);
          setSuggestions(result.children);
          setSuggestionError(undefined);
        })
        .catch((loadError) => {
          if (generation !== suggestionGeneration.current) return;
          setSuggestions([]);
          setSuggestionError(loadError instanceof Error ? loadError.message : "Could not load path suggestions");
        });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [path, token]);

  const navigate = (nextPath: string) => {
    void loadDirectory(nextPath);
  };

  const submit = (value = path) => {
    const next = value.trim();
    if (!next) {
      setValidationError("Enter a workspace directory path.");
      return;
    }
    if (next !== "~" && !next.startsWith("~/") && !next.startsWith("~\\") && !isAbsoluteWorkspacePath(next)) {
      setValidationError("Workspace paths must be absolute, or begin with ~.");
      return;
    }
    setValidationError(undefined);
    onOpen(next);
  };

  const navigateTypedPath = () => {
    const next = path.trim();
    if (!next) {
      setValidationError("Enter a workspace directory path.");
      return;
    }
    if (next !== "~" && !next.startsWith("~/") && !next.startsWith("~\\") && !isAbsoluteWorkspacePath(next)) {
      setValidationError("Workspace paths must be absolute, or begin with ~.");
      return;
    }
    setValidationError(undefined);
    navigate(next);
  };

  const typedCompletion = workspacePathCompletion(path);
  const exactSuggestion = suggestions.find((suggestion) => pathKey(displayWorkspacePath(suggestion.path, homePath)) === pathKey(path.trim()) || (typedCompletion?.query === suggestion.name && !/[\\/]$/.test(path.trim())));
  const pathError = error || browseError || suggestionError || validationError;
  const displayedCurrentPath = displayWorkspacePath(currentPath, homePath);
  const canGoHome = homePath ? pathKey(currentPath) !== pathKey(homePath) : currentPath !== "~";
  const canGoParent = Boolean(parentPath && pathKey(parentPath) !== pathKey(currentPath));

  return (
    <main className="picker-screen">
      <section className="picker-card workspace-picker-card">
        <div className="brand-mark">ai<span>ni</span>de</div>
        <p className="eyebrow">LOCAL DEVELOPER COCKPIT</p>
        <h1>Choose a workspace</h1>
        <p className="muted picker-copy">Open a local project to edit, inspect Git, and run its tools. Nothing leaves this machine.</p>
        {recentProjects.length > 0 && (
          <div className="recent-projects picker-recent">
            <span className="field-label">Recent projects</span>
            {recentProjects.map((project) => (
                <button key={project.projectId} className="recent-project" type="button" onClick={() => onOpen(project.rootPath)} disabled={busy}>
                {project.name}
                <small>{project.rootPath}</small>
              </button>
            ))}
          </div>
        )}

        <WorkspacePickerManualEntry
          path={path}
          suggestions={suggestions}
          activeSuggestion={activeSuggestion}
          pathError={pathError}
          onChange={(event) => { setPath(event.target.value); setValidationError(undefined); setBrowseError(undefined); setSuggestionError(undefined); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && suggestions.length) {
              event.preventDefault();
              setActiveSuggestion((index) => (index + 1) % suggestions.length);
            } else if (event.key === "ArrowUp" && suggestions.length) {
              event.preventDefault();
              setActiveSuggestion((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
            } else if (event.key === "Tab" && activeSuggestion >= 0) {
              const suggestion = suggestions[activeSuggestion];
              if (suggestion) {
                event.preventDefault();
                suppressSuggestions.current = true;
                setPath(displayWorkspacePath(suggestion.path, homePath));
                setSuggestions([]);
                setActiveSuggestion(-1);
              }
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (activeSuggestion >= 0 && suggestions[activeSuggestion]) navigate(suggestions[activeSuggestion].path);
              else if (exactSuggestion) navigate(exactSuggestion.path);
              else navigateTypedPath();
            }
          }}
          onSuggestionSelect={navigate}
        />
        <button className="primary-button open-button" onClick={() => submit()} disabled={busy || !path.trim()}>
          {busy ? "Opening workspace..." : "Open project"}
          <span>↵</span>
        </button>
        <p className="picker-hint">Browse one folder at a time, or enter a path manually. The server validates it as a directory.</p>

        <div className="picker-navigation">
          <div className="picker-current-path">
            <span className="field-label">Current directory</span>
            <code>{displayedCurrentPath}</code>
          </div>
          <div className="picker-navigation-actions">
            <button type="button" onClick={() => navigate(homePath ?? "~")} disabled={!canGoHome || loading}>Home</button>
            <button type="button" onClick={() => parentPath && navigate(parentPath)} disabled={!canGoParent || loading}>Parent</button>
          </div>
        </div>

        <div className="picker-folders" aria-live="polite">
          {loading && <div className="picker-state">Loading folders...</div>}
          {!loading && browseError && <div className="picker-state error-box">{browseError}</div>}
          {!loading && !browseError && children.length === 0 && <div className="picker-state">No child directories.</div>}
          {!loading && !browseError && children.length > 0 && (
            <ul className="folder-list" aria-label="Child directories">
              {children.map((child) => (
                <li key={child.path}>
                  <button type="button" onClick={() => navigate(child.path)} disabled={busy}>
                    <span aria-hidden="true">▸</span>{child.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

export { displayWorkspacePath, isAbsoluteWorkspacePath, parentWorkspacePath, workspacePathCompletion } from "../workspace-path";

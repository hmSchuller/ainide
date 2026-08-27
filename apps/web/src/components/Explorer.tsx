import { useEffect, useState } from "react";
import type { FileEntry, GitFileStatusKind } from "@ainide/shared";
import { listFiles } from "../api";
import { explorerMenuItemsForEntry } from "../explorer-actions";
import { useAppStore } from "../store";
import { ContextMenu } from "./ContextMenu";

interface ExplorerProps {
  onOpenFile: (entry: FileEntry, secondary: boolean) => void;
  onRefresh: () => void;
  onCopyPath: (entry: FileEntry) => void;
  onCopyContents: (entry: FileEntry) => void;
  onAddToReferenceKit: (entry: FileEntry) => void;
  onRenameEntry: (entry: FileEntry) => void;
  onDeleteEntry: (entry: FileEntry) => void;
  onCreateEntry: (parentPath: string, type: "file" | "directory") => void;
}

const statusLetters: Record<GitFileStatusKind, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "U",
  conflicted: "!",
};

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function Explorer({
  onOpenFile,
  onRefresh,
  onCopyPath,
  onCopyContents,
  onAddToReferenceKit,
  onRenameEntry,
  onDeleteEntry,
  onCreateEntry,
}: ExplorerProps) {
  const workspace = useAppStore((state) => state.workspace);
  const token = useAppStore((state) => state.token);
  const directories = useAppStore((state) => state.directories);
  const expanded = useAppStore((state) => state.expanded);
  const selectedPath = useAppStore((state) => state.selectedPath);
  const recentChanges = useAppStore((state) => state.recentChanges);
  const setDirectory = useAppStore((state) => state.setDirectory);
  const toggleDirectory = useAppStore((state) => state.toggleDirectory);
  const setSelected = useAppStore((state) => state.setSelected);
  const git = useAppStore((state) => state.git);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: FileEntry }>();

  const load = async (path: string) => {
    const state = useAppStore.getState();
    if (!state.token) return;
    const existing = state.directories[path];
    setDirectory(path, { entries: existing?.entries ?? [], loading: true });
    try {
      setDirectory(path, { entries: await listFiles(path, state.token), loading: false });
    } catch (error) {
      setDirectory(path, { entries: [], loading: false, error: error instanceof Error ? error.message : "Unable to list files" });
    }
  };

  useEffect(() => {
    if (!workspace || !token) return;
    const { directories: cached, expanded: open } = useAppStore.getState();
    if (!cached[""]) void load("");
    for (const [path, isOpen] of Object.entries(open)) {
      if (isOpen && !cached[path]) void load(path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, workspace?.rootPath, token]);

  const statusFor = (path: string): GitFileStatusKind | undefined => {
    const direct = git?.files.find((file) => file.path === path);
    return direct?.status;
  };

  const openMenu = (event: React.MouseEvent, entry: FileEntry) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(entry.path);
    setMenu({ x: event.clientX, y: event.clientY, entry });
  };

  const renderEntries = (path: string, depth: number): JSX.Element => {
    const directory = directories[path];
    if (!directory) return <div className="tree-message" style={{ paddingLeft: `${depth * 14 + 28}px` }}>Loading...</div>;
    if (directory.error) return <div className="tree-message tree-error" style={{ paddingLeft: `${depth * 14 + 28}px` }}>{directory.error}</div>;
    if (directory.loading && directory.entries.length === 0) return <div className="tree-message" style={{ paddingLeft: `${depth * 14 + 28}px` }}>Reading folder...</div>;
    if (directory.entries.length === 0) return <div className="tree-message" style={{ paddingLeft: `${depth * 14 + 28}px` }}>Empty folder</div>;
    return (
      <>
        {directory.entries.map((entry) => {
          const status = entry.gitStatus ?? statusFor(entry.path);
          const isOpen = Boolean(expanded[entry.path]);
          const changedAt = recentChanges[entry.path];
          return (
            <div key={entry.path}>
              <button
                className={`tree-row ${selectedPath === entry.path ? "selected" : ""}`}
                style={{ paddingLeft: `${depth * 14 + 12}px` }}
                onClick={(event) => {
                  setSelected(entry.path);
                  if (entry.type === "directory") {
                    const opening = !expanded[entry.path];
                    toggleDirectory(entry.path);
                    if (opening && !directories[entry.path]) void load(entry.path);
                  } else onOpenFile(entry, event.shiftKey);
                }}
                onContextMenu={(event) => openMenu(event, entry)}
                title={entry.path}
              >
                <span className="tree-chevron">{entry.type === "directory" ? (isOpen ? "⌄" : "›") : ""}</span>
                <span className={`file-icon ${entry.type}`}>{entry.type === "directory" ? (isOpen ? "▾" : "▸") : "·"}</span>
                <span className="tree-name">{entry.name || basename(entry.path)}</span>
                {(entry.recent || (changedAt && Date.now() - changedAt < 10 * 60 * 1000)) && <span className="recent-dot" title="Recently changed externally" />}
                {status && <span className={`git-letter git-${status}`} title={`Git: ${status}`}>{statusLetters[status]}</span>}
              </button>
              {entry.type === "directory" && isOpen && renderEntries(entry.path, depth + 1)}
            </div>
          );
        })}
      </>
    );
  };

  if (!workspace) return null;
  return (
    <aside className="explorer" aria-label="Workspace explorer">
      <header className="panel-header explorer-header">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <strong title={workspace.rootPath}>{workspace.name || basename(workspace.rootPath)}</strong>
        </div>
        <button className="icon-button" onClick={onRefresh} title="Refresh files and Git">↻</button>
      </header>
      <div className="tree-root">{renderEntries("", 0)}</div>
      <footer className="explorer-footer"><span className="status-pip" /> {git?.isRepository ? `${git.branch ?? "detached"} · ${git.summary.filesChanged} changed` : "Not a Git repository"}</footer>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          items={explorerMenuItemsForEntry(menu.entry, {
            onOpen: () => onOpenFile(menu.entry, false),
            onOpenToSide: () => onOpenFile(menu.entry, true),
            onCopyPath: () => onCopyPath(menu.entry),
            onCopyContents: menu.entry.type === "file" ? () => onCopyContents(menu.entry) : undefined,
            onAddToReferenceKit: menu.entry.type === "file" ? () => onAddToReferenceKit(menu.entry) : undefined,
            onNewFile: menu.entry.type === "directory" ? () => onCreateEntry(menu.entry.path, "file") : undefined,
            onNewFolder: menu.entry.type === "directory" ? () => onCreateEntry(menu.entry.path, "directory") : undefined,
            onRename: () => onRenameEntry(menu.entry),
            onDelete: () => onDeleteEntry(menu.entry),
          })}
        />
      )}
    </aside>
  );
}

export function joinWorkspacePath(parentPath: string, name: string): string {
  const cleanName = name.trim().replaceAll("\\", "/");
  if (!cleanName || cleanName.includes("/") || cleanName.includes("..")) {
    throw new Error("Enter a valid name without slashes");
  }
  return parentPath ? `${parentPath}/${cleanName}` : cleanName;
}

export function parentDirectory(entryPath: string): string {
  const parts = entryPath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function renameEntryPath(entryPath: string, newName: string): string {
  const parent = parentDirectory(entryPath);
  return joinWorkspacePath(parent, newName);
}

export function basenameFromPath(entryPath: string): string {
  return entryPath.split(/[\\/]/).filter(Boolean).pop() ?? entryPath;
}

export function explorerMenuItemsForEntry(
  entry: { path: string; type: "file" | "directory" },
  handlers: {
    onOpen: () => void;
    onOpenToSide: () => void;
    onCopyPath: () => void;
    onCopyContents?: () => void;
    onAddToReferenceKit?: () => void;
    onNewFile?: () => void;
    onNewFolder?: () => void;
    onRename: () => void;
    onDelete: () => void;
  },
): Array<{ label: string; danger?: boolean; disabled?: boolean; run: () => void }> {
  const shared = [
    { label: "Copy path", run: handlers.onCopyPath },
    { label: "Rename", run: handlers.onRename },
    { label: "Delete", danger: true, run: handlers.onDelete },
  ];
  if (entry.type === "file") {
    return [
      { label: "Open", run: handlers.onOpen },
      { label: "Open to side", run: handlers.onOpenToSide },
      { label: "Copy path", run: handlers.onCopyPath },
      ...(handlers.onCopyContents ? [{ label: "Copy contents", run: handlers.onCopyContents }] : []),
      ...(handlers.onAddToReferenceKit ? [{ label: "Add to reference kit", run: handlers.onAddToReferenceKit }] : []),
      { label: "Rename", run: handlers.onRename },
      { label: "Delete", danger: true, run: handlers.onDelete },
    ];
  }
  return [
    ...(handlers.onNewFile ? [{ label: "New file", run: handlers.onNewFile }] : []),
    ...(handlers.onNewFolder ? [{ label: "New folder", run: handlers.onNewFolder }] : []),
    ...shared,
  ];
}

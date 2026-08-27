import { describe, expect, it } from "vitest";
import { explorerMenuItemsForEntry, joinWorkspacePath, renameEntryPath } from "./explorer-actions";

describe("explorer actions", () => {
  it("builds file and folder menu items", () => {
    const fileLabels = explorerMenuItemsForEntry({ path: "src/a.ts", type: "file" }, {
      onOpen: () => undefined,
      onOpenToSide: () => undefined,
      onCopyPath: () => undefined,
      onCopyContents: () => undefined,
      onAddToReferenceKit: () => undefined,
      onRename: () => undefined,
      onDelete: () => undefined,
    }).map((item) => item.label);
    expect(fileLabels).toEqual([
      "Open",
      "Open to side",
      "Copy path",
      "Copy contents",
      "Add to reference kit",
      "Rename",
      "Delete",
    ]);

    const folderLabels = explorerMenuItemsForEntry({ path: "src", type: "directory" }, {
      onOpen: () => undefined,
      onOpenToSide: () => undefined,
      onCopyPath: () => undefined,
      onNewFile: () => undefined,
      onNewFolder: () => undefined,
      onRename: () => undefined,
      onDelete: () => undefined,
    }).map((item) => item.label);
    expect(folderLabels).toEqual(["New file", "New folder", "Copy path", "Rename", "Delete"]);
  });

  it("joins and renames workspace-relative paths safely", () => {
    expect(joinWorkspacePath("src", "new.ts")).toBe("src/new.ts");
    expect(renameEntryPath("src/old.ts", "new.ts")).toBe("src/new.ts");
    expect(() => joinWorkspacePath("src", "../escape")).toThrow();
  });
});

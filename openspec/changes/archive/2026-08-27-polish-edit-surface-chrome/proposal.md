## Why

The Edit surface still carries chrome from earlier workflows: an expanded terminal footer, a always-visible empty reference kit, toolbar buttons for reference and save actions, and click-only explorer rows. Auto-save and context-driven workflows make much of this redundant. Collapsing defaults and moving actions to right-click menus keeps the cockpit focused on reading code and handing context to agents.

## What Changes

- Default the terminal utility footer to collapsed on Edit and Review surfaces.
- Hide the reference kit dock entirely when it has no items; show it only after the first reference is added.
- Move reference actions (copy selection, add selection to kit, copy file, add file to kit) from the editor toolbar into the Monaco editor context menu.
- Remove the visible Save button from the editor toolbar; manual save remains available via `⌘S` and the command palette.
- Add a right-click context menu on explorer file and folder rows with open, copy, reference-kit, rename, delete, and new-file/folder actions as appropriate.
- Add safe server-side file mutations (delete, rename, create file, create directory) routed through the existing workspace path resolver.
- Remove the explorer `+` reference shortcut and redundant editor-toolbar reference buttons once context menus cover those actions.

## Capabilities

### New Capabilities

- `terminal-utility-panel`: Default collapsed state and persistence for the bottom terminal panel on Edit and Review surfaces.
- `workspace-file-operations`: Safe delete, rename, and create operations for workspace files and directories exposed through authenticated HTTP APIs.

### Modified Capabilities

- `workspace-explorer`: Right-click context menus on tree rows and integration with file operations and reference-kit actions.
- `editor-auto-save`: Editor toolbar no longer exposes a Save button; manual save behavior via keyboard and command palette remains.
- `agent-reference-handoff`: Reference kit dock visibility rules and relocation of reference capture actions from persistent toolbar chrome to editor and explorer context menus.

## Impact

- `apps/web`: `TerminalPanel`, `ReferenceDock`, `Editor`, `Explorer`, shared context-menu UI, `App` layout and keyboard shortcuts; mobile toolbar CSS adjustments.
- `apps/server`: New file mutation endpoints on `WorkspaceService` with path-resolver safety tests; possible `packages/shared` types for mutation requests.
- `apps/web/src/api.ts`: Client helpers for delete, rename, and create operations.
- Existing auto-save, reference serialization, agent handoff, and terminal survival behavior must remain intact.
- No cloud services, session tokens in snapshots, or generic command-execution endpoints.

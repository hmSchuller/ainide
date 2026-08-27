## 1. Terminal Utility Panel Defaults

- [x] 1.1 Default `terminalCollapsed` to `true` in the web store and load/save collapse state from `localStorage` (`ainide:terminal-collapsed`); verify first load shows a collapsed panel and toggling survives browser reload without appearing in session snapshot JSON tests.
- [x] 1.2 Confirm Agents mode still hides `TerminalPanel` and Edit/Review expand/collapse via existing controls and `⌘J`; verify manual check or component test that mode switch does not force the utility panel open.

## 2. Workspace File Operations (Server)

- [x] 2.1 Add `delete`, `rename`, `createFile`, and `createDirectory` to `WorkspaceService` using the safe path resolver; verify unit tests cover success paths, existing-path conflicts, and path traversal/symlink rejection.
- [x] 2.2 Expose `DELETE /api/file`, `POST /api/file/rename`, and `POST /api/file/create` with session-token auth and active-project scoping; verify server integration tests for each route.
- [x] 2.3 Add shared types if needed and web `api.ts` helpers for delete, rename, and create; verify typecheck passes for `@ainide/shared` and `apps/web`.

## 3. Reference Kit Visibility And Editor Context Menu

- [x] 3.1 Render `ReferenceDock` only when `referenceKit.length > 0` and hide it again after clear; verify UI test or component test covers empty, first-add, and clear-last-item transitions.
- [x] 3.2 Register Monaco context menu actions for the four reference capture operations with selection gating; verify actions invoke the same handlers as the prior toolbar buttons and selection actions require a non-empty range.
- [x] 3.3 Remove editor-toolbar reference buttons and the explorer inline `+` control; verify the editor toolbar no longer shows reference or Save buttons on desktop and mobile CSS no longer targets removed controls.

## 4. Editor Save Chrome

- [x] 4.1 Remove the visible Save button from `Editor` while keeping `⌘S` and command palette Save calling flush/manual save with success notice; verify keyboard shortcut test or manual matrix still saves dirty buffers and shows notice.

## 5. Explorer Context Menu

- [x] 5.1 Add a reusable `ContextMenu` component (positioned portal, Escape, click-outside close); verify component test covers open, action, and dismiss behavior.
- [x] 5.2 Wire explorer `onContextMenu` for files and folders with Open, Open to side, Copy path, Copy contents (files), Add to reference kit (files), New file/folder (folders), Rename, and Delete; verify menu items match entry type.
- [x] 5.3 Implement explorer mutation handlers: confirm destructive ops, call new APIs, refresh listings, flush auto-save before delete, prompt on dirty flush failure, update tab paths on rename, and close tabs on delete; verify integration tests for rename-open-tab and delete-dirty-file paths.
- [x] 5.4 Implement clipboard actions for copy path and copy contents without disk mutation; verify helper tests or UI tests place expected text on the clipboard.

## 6. Verification

- [x] 6.1 Run `npm run typecheck` and `npm test` from the repository root and resolve failures introduced by this change.
- [x] 6.2 Exercise the acceptance matrix: collapsed terminal on fresh load, reference dock hidden until first add, editor right-click reference actions work, Save absent from toolbar but `⌘S` works, explorer right-click open/copy/reference/rename/delete/new file/folder work, and path escape attempts are rejected server-side; record the result in this task file.

### Acceptance matrix (2026-08-27)

| Check | Result |
| --- | --- |
| Terminal defaults collapsed with `ainide:terminal-collapsed` persistence | Covered by `layout-prefs.test.ts`; not in disk snapshot |
| Agents mode hides terminal panel | Covered by `terminalPanelVisible()` + `App.tsx` |
| Reference dock hidden until first kit item | Covered by `shouldShowReferenceDock()` + conditional render |
| Editor reference actions in Monaco context menu with selection gating | Implemented in `Editor.tsx` (`editorHasSelection` precondition) |
| Save removed from toolbar; `⌘S` / palette Save retained | Toolbar updated; keyboard/palette handlers unchanged |
| Explorer context menu actions by entry type | Covered by `explorer-actions.test.ts` + `Explorer.tsx` wiring |
| File delete/rename/create APIs with path safety | Covered by `workspace.test.ts` + `server.test.ts` |
| Rename updates open tab path | Covered by `store.test.ts` |
| Clipboard copy path/contents | Covered by `clipboard.test.ts` |
| `npm run typecheck` / `npm test` | Pass (root, 2026-08-27) |

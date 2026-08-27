## Context

See `proposal.md` for motivation. The Edit surface currently defaults to an expanded terminal footer, always shows an empty reference kit dock, exposes four reference actions and a Save button in the editor toolbar, and uses click-only explorer rows with a inline `+` control for reference capture. Auto-save already debounces writes; reference kit and handoff logic live in `ReferenceDock`, `Editor`, and `Explorer`. The server exposes list/read/write for files only; mutations beyond write require new safe-resolver-backed endpoints.

## Goals / Non-Goals

**Goals:**

- Reduce permanent Edit-surface chrome by collapsing the terminal panel by default and hiding an empty reference kit.
- Move reference capture and explorer file actions into context menus while preserving existing serialization, handoff, and auto-save behavior.
- Add path-safe file delete, rename, and create APIs plus explorer integration with dirty-tab safety.
- Persist terminal collapse preference in `localStorage`, not session snapshots.

**Non-Goals:**

- Changing Agents mode layout, agent session restoration, or reference-kit persistence rules.
- Adding editor settings UI or disabling auto-save.
- Clipboard-based explorer actions that require cloud upload or external services.
- Generic command-execution HTTP endpoints; shell operations remain in PTYs.

## Decisions

### 1. Terminal collapse default and persistence

**Choice:** Default `terminalCollapsed` to `true` in the Zustand store and persist user toggles to `localStorage` (`ainide:terminal-collapsed`), mirroring `ainide:explorer-width`.

**Alternatives:** Session-snapshot persistence (rejected: layout preference is browser-local, not project data). No persistence (rejected: users would lose preference every reload).

### 2. Reference dock visibility

**Choice:** Conditionally render `ReferenceDock` only when `referenceKit.length > 0` in `App.tsx`. Keep the full dock (items, target agent, Copy/Paste) when visible.

**Alternatives:** Collapsed strip when empty (rejected: user asked to hide entirely). Toast-only feedback without dock (rejected: handoff controls need a surface when kit is non-empty).

### 3. Editor reference actions via Monaco context menu

**Choice:** Register `editor.addAction` entries in the existing `onMount` hook with `contextMenuGroupId` / `contextMenuOrder` for: Copy as reference, Add selection to kit, Copy file as reference, Add file to kit. Selection actions use Monaco preconditions or runtime checks so they appear only with a non-empty selection. Remove the four toolbar buttons; keep path label and Find / Go to line (or rely on Monaco defaults for those).

**Alternatives:** Custom React overlay context menu (rejected: duplicates Monaco native menu). Keep toolbar buttons on desktop (rejected: conflicts with chrome-reduction goal).

### 4. Shared context menu component for explorer

**Choice:** Lightweight `ContextMenu` component (fixed-position portal, keyboard Escape, click-outside close) driven by `{ x, y, items }` state from `Explorer`. Explorer `onContextMenu` on tree rows sets target entry and opens menu.

**Alternatives:** Native browser `contextmenu` with custom DOM (same approach). Third-party menu library (rejected: unnecessary dependency).

### 5. Server file mutation API shape

**Choice:** Extend `WorkspaceService` with `delete(relativePath)`, `rename(from, to)`, `createFile(relativePath)`, `createDirectory(relativePath)` using existing path resolver. HTTP routes:

- `DELETE /api/file?path=...` — delete file or directory tree
- `POST /api/file/rename` — body `{ from, to }`
- `POST /api/file/create` — body `{ path, type: "file" | "directory" }`

Reuse session token auth and `projects.requireActive()` scoping.

**Alternatives:** Single mutation endpoint with action enum (rejected: less REST-clear, harder to test individually). Client-side shell via PTY (rejected: violates explicit server operations pattern).

### 6. Explorer mutations and open tabs

**Choice:** On delete/rename, call existing auto-save flush for affected paths; if still dirty after failed save, confirm with user. On rename, update tab paths in the store via `updateTab` keyed by old path. On delete of open file, close tab after successful delete (with flush/confirm). Refresh explorer listings for parent directories after mutations.

**Alternatives:** Always close without prompt (rejected: data loss). Leave stale tabs (rejected: confusing UX).

### 7. Save button removal only

**Choice:** Remove toolbar Save button and mobile CSS that privileged `.save-mini`. Keep `⌘S` in `App.tsx` and command palette "Save" entry calling `saveFile` / `autoSaver.flush` with success notice.

**Alternatives:** Remove manual save entirely (rejected: spec requires keyboard/palette manual save; immediate flush is still useful).

## Risks / Trade-offs

- **[Discovery]** Hidden reference kit and removed toolbar buttons reduce visibility of reference features → Mitigation: context menu labels match prior button text; success notice on first add-to-kit.
- **[Monaco menu clutter]** Four custom entries plus defaults → Mitigation: group under a single `ainide` context menu group; selection actions disabled without selection.
- **[Delete safety]** Recursive directory delete is destructive → Mitigation: confirm dialog with path; path resolver blocks escapes; tests for traversal/symlinks.
- **[Rename races]** External file watcher may fire during rename → Mitigation: update tab paths client-side immediately; rely on existing chokidar refresh.
- **[agent-reference-handoff archive order]** Delta modifies a capability still in an unarchived change → Mitigation: archive or sync `add-agent-workbench-reference-kit` before this change, or merge deltas carefully during archive.

## Migration Plan

Deploy server and web together so new explorer menus call existing or new APIs atomically. No disk snapshot migration. `localStorage` absence yields collapsed terminal (new default). Rollback: old client ignores new endpoints; new client against old server shows errors on explorer mutations only.

## Open Questions

None — scope and defaults were resolved during exploration (full explorer file ops in v1, persist terminal collapse, keep manual save shortcut).

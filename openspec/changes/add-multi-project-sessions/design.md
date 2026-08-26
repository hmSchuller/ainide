## Context

See `proposal.md` for motivation. Today `WorkspaceManager`, `TerminalManager`, and `ReviewManager` are process singletons. `POST /api/workspace/open` stops review and calls `terminals.close()`, so a second root cannot coexist with the first. File events have no project identity. The web store holds one workspace plus one set of tabs/panes. Persistence is `localStorage` keys `ainide:last-workspace` and layout sizes; `~/.config/ainide/config.json` holds only agent/shell settings. Session tokens stay in RAM for the process lifetime (`GET /api/session` returns the same token until exit). PTY sessions already survive WebSocket disconnect; they die when the Node process exits (SIGINT/SIGTERM → `server.close()`).

## Goals / Non-Goals

**Goals:**

- Introduce a server-side registry of live projects with a single `active` pointer that all file, Git, and review APIs use.
- Tag PTY sessions with a project id so switch and browser reconnect never kill or duplicate them.
- Persist session snapshots next to existing local config; server is the source of truth.
- Keep path safety per active root (same `resolveSafePath` rules, no cross-project reads/writes).
- Swap per-project UI state in the web store so dirty buffers survive switch in the same page, not browser close.

**Non-Goals:**

- tmux, abduco, or any holder so agents survive ainide process exit.
- Persisting unsaved Monaco contents or the session token.
- Multi-root / split-workspace view, or independent active projects per browser tab.
- Changing agent command, Difit scopes, or Edit/Review mode mechanics beyond binding them to the active project.

## Decisions

### 1. Live registry + active pointer

Keep one Fastify process. Add a `ProjectRegistry` that maps `projectId` (resolved realpath) to a live record:

- `WorkspaceManager` instance (watcher, git, recent changes, path resolver)
- PTY session ids belonging to that project
- last UI snapshot (also written to disk)

`activeProjectId` selects which manager file/Git/review APIs talk to. Opening a path that already exists in the map activates it; it does not create a second live copy.

**Alternative considered:** One `WorkspaceManager` with multiple roots. Rejected — watcher, ignore patterns, and `requireRoot()` are all single-root today; composing instances is smaller than a multi-root rewrite.

**Alternative considered:** Per-request `projectId` on every file API. Rejected for v1 — one cockpit, one active project. Two browser tabs share the same active pointer (last switch wins). Acceptable for a local single-user process.

### 2. PTY sessions tagged, never globally closed on switch

`TerminalManager` stays one map. Each `TerminalSession` gains `projectId`. `create` uses the active project's cwd and stamps that id. `list` for the UI returns only the active project's sessions. `close()` on process shutdown still kills everything. Project close kills only matching ids.

`POST /api/workspace/open` (or the new open/switch endpoints) MUST NOT call `terminals.close()`. That is the behavior change that makes parallel agents possible.

On activate or browser reconnect, `reconcileTerminals` creates default kinds (agent, shell, lazygit) only when that **project** has no living session of that kind. It must not look at a global list.

### 3. Hidden projects: PTYs yes, watcher/review no

While a project is hidden:

- PTYs keep running (agents continue).
- Its `chokidar` watcher is stopped to bound file-descriptor use; Git refresh is not pushed to the UI.
- Difit is stopped (`ReviewManager.stop()` on switch). Review start always uses the new active cwd.

On activate: start the watcher, `refreshGit()`, reload the explorer, reload **clean** tabs from disk, and run existing dirty-buffer conflict detection against disk for unsaved tabs.

**Alternative considered:** Keep watchers on all live projects for activity badges. Deferred — spec only forbids leaking hidden events into the visible UI; pausing the watcher is enough and cheaper.

### 4. Events carry `projectId`; the client ignores the rest

Extend `WorkspaceEvent` with `projectId`. The server may still emit from a manager that has a watcher only while active, but the client MUST ignore events whose `projectId` is not the current active project. Today's `workspace_changed` → `loadWorkspaceData` → `reconcileTerminals` loop is unsafe and must stop; reconnect/activate is the only place that reconciles terminals.

### 5. Protocol: session bootstrap plus project commands

Keep existing file/Git/terminal/review routes operating on the active project so the resolver stays implicit and safe.

Add explicit project commands (names indicative):

- `GET /api/session` — token, open projects, known projects, `activeProjectId` (one bootstrap round trip)
- `POST /api/projects/open` `{ path }` — validate directory, add or reuse live record, set active, stop previous review
- `POST /api/projects/switch` `{ projectId }` — set active, stop previous review, do not kill PTYs
- `DELETE /api/projects` `{ projectId }` — kill that project's PTYs, drop the live record, activate another or none

`GET /api/workspace` remains "the active workspace or null" for compatibility. Opening via the old `/api/workspace/open` can delegate to `projects/open` so it no longer teardowns siblings.

### 6. Snapshots on disk; UI bags in the browser

Server writes `~/.config/ainide/sessions.json` (or `AINIDE_SESSIONS`, defaulting next to `config.json`):

```text
version, activeRootPath,
projects[]: { rootPath, name, openFilePaths, panes, secondaryOpen, expandedPaths, mode, terminalKinds }
```

No file contents, no token, no PTY pids. Write on open/switch/close and debounced UI snapshot updates (tab paths, layout). On process start, load the file, open last-active if the directory exists, recreate recorded terminal kinds (new processes). Other known projects are recents until the user switches to them, which then makes them live.

The web store keeps `Record<projectId, ProjectUiState>` for the **page lifetime** (tabs including dirty buffers, panes, explorer, mode). Switch = snapshot current bag, restore the other bag. Browser reload discards bags; the client reopens paths from the server snapshot and `readFile`.

**Alternative considered:** Persist dirty buffers on the server. Rejected — secrets in config, and the exploration chose paths-only resume after browser close.

**Alternative considered:** `localStorage` as source of truth. Rejected — terminals live on the server; a second browser would diverge. Layout chrome (explorer width) can stay in `localStorage`.

Seed: if no `sessions.json` exists, read `ainide:last-workspace` once as the first known path.

### 7. UI: switcher in the top bar, picker for add/empty

Replace the static brand workspace name with a project control: list open projects, switch, close, and "open another" (existing absolute-path picker). Command palette actions for switch/open/close. Empty state remains the picker when no project is active.

## Risks / Trade-offs

- **Risk:** Hidden agents keep spending tokens and writing files the user cannot see. → **Mitigation:** Switcher lists open projects; closing a project is the explicit kill. No tmux means quitting ainide still stops everything.
- **Risk:** `reconcileTerminals` duplicates agents on reconnect. → **Mitigation:** Filter existing sessions by `projectId` before creating default kinds; add a server test for that.
- **Risk:** Unscoped `file_changed` applies another project's path to the active editor. → **Mitigation:** `projectId` on events; client ignore; hidden watchers stopped.
- **Risk:** Many live projects accumulate PTYs. → **Mitigation:** Only one watcher; no hard cap in v1. Closing a project is the release valve.
- **Risk:** Stale snapshot paths after a project was reorganized. → **Mitigation:** Opening a saved path that fails to read drops that tab with an error notice, same as today's missing file.
- **Risk:** Two browser tabs fight over `activeProjectId`. → **Mitigation:** Accept for v1; session payload and events keep them eventually consistent.

## Migration Plan

No repo-local data to migrate. Deploy server + web together (protocol and UI are coupled). First start creates `sessions.json`; absence is normal. Rollback is a revert: a single `WorkspaceManager` and `terminals.close()` on open restore today's behavior; leftover `sessions.json` can be ignored. Session tokens remain unpersisted, so a rollback does not leave a durable credential.

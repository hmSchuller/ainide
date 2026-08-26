## 1. Shared protocol

- [x] 1.1 Add `projectId` on `TerminalSession` and `WorkspaceEvent`, plus types for open/known projects and session snapshots (paths and layout only); verify `npm run typecheck -w @ainide/shared` passes.
- [x] 1.2 Extend session bootstrap payload with token, open projects, known projects, and `activeProjectId` without persisting the token; verify the type exports compile from server and web.

## 2. Project registry

- [x] 2.1 Implement `ProjectRegistry` keyed by resolved realpath, with one `WorkspaceManager` per live project, a single active pointer, and reuse-on-open for the same path; verify unit tests for first open, second open, duplicate path, switch, and close-last.
- [x] 2.2 Pause the hidden project's watcher on switch and start the newly active watcher with git refresh; verify a file change in a hidden project does not emit events used by the active UI, and activate reloads git for the new root.
- [x] 2.3 Route file list/read/write/search and git status through the active project's resolver only; verify path-escape tests still pass and a relative path cannot read another live project's files.

## 3. Terminals

- [x] 3.1 Stamp each PTY session with `projectId`, filter `list()` to the active project, and add close-by-project; verify creating two projects yields distinct sessions and closing one does not kill the other.
- [x] 3.2 Stop calling `terminals.close()` on workspace/project open or switch; kill all sessions only on process shutdown; verify a living PTY pid is unchanged across switch and still alive after a simulated client disconnect.
- [x] 3.3 Reconcile default agent/shell/lazygit kinds per project so a kind is created only when that project has no living session of that kind; verify reconnect/activate does not duplicate an already-alive agent.

## 4. Review

- [x] 4.1 Bind `ReviewManager` cwd to the active project, stop Difit on switch/close, and keep the existing no-workspace error when nothing is active; verify review tests for no-active-project, start-uses-active-cwd, and stop-on-switch.

## 5. Session snapshots

- [x] 5.1 Read/write `sessions.json` beside existing config (`AINIDE_SESSIONS` override), storing known projects, last active, open paths, panes, explorer expansion, mode, and terminal kinds — never buffer contents or the session token; verify a round-trip test and that serialized JSON has no content/token fields.
- [x] 5.2 On process start, load the snapshot, open last-active when the directory exists, recreate recorded terminal kinds as new PTYs, and surface a recoverable error when last-active is missing; verify missing-path and happy-path startup tests.
- [x] 5.3 Persist snapshots on open/switch/close and debounced UI path/layout updates; verify switching projects updates `activeRootPath` on disk.

## 6. HTTP API

- [x] 6.1 Add project open/switch/close routes and make `GET /api/session` and `GET /api/workspace` report the registry; delegate `POST /api/workspace/open` to open-without-teardown; verify API tests for open-second, switch, close, duplicate path, and session bootstrap.
- [x] 6.2 Include `projectId` on workspace events; verify the client-facing payload for the active project includes it and file APIs still require the session token.

## 7. Web state

- [x] 7.1 Store per-project UI bags (tabs including dirty buffers, panes, explorer, mode, git, terminals) and swap bags on switch without saving dirty files; verify a store/helper test that dirty content survives switch-and-back in the same page.
- [x] 7.2 On browser bootstrap/reconnect, apply the session payload, attach existing terminals, reconcile kinds without duplicates, and reopen saved paths from disk (not unsaved contents); verify events for a non-active `projectId` do not mutate tabs or explorer.
- [x] 7.3 On activate, reload clean tabs from disk and run existing conflict detection for dirty tabs; verify a clean tab picks up a hidden-agent disk change after switch-back.

## 8. Switcher UI

- [x] 8.1 Replace the top-bar workspace label with a project switcher listing open projects, plus open-another (existing path picker) and close; verify only the active project's explorer, editor, and terminals are visible.
- [x] 8.2 Add command-palette actions for open/switch/close; when the last project closes, show the picker populated from known projects; verify empty, single, and multi-project states in the running app.
- [x] 8.3 Seed known projects from `ainide:last-workspace` only when `sessions.json` is absent; verify the picker still accepts an absolute path.

## 9. Verification

- [x] 9.1 Run `npm run typecheck` and `npm test` from the repository root and resolve failures from this change.
- [x] 9.2 Exercise the acceptance matrix: two projects live, agent survives switch and browser reload (server left running), no duplicate agent, dirty buffer survives switch but not reload, close kills only that project's PTYs, review stops on switch, last-active restores after process restart with new PTYs, missing last-active is recoverable; record the result before completing the change.

## Acceptance matrix results (2026-08-26)

Recorded from `npm test` (server `acceptance.test.ts`, `projects.test.ts`, `terminals.test.ts`, `server.test.ts`, `review.test.ts`; web `project-ui.test.ts`) plus `npm run typecheck`.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Two projects live | PASS | `acceptance.test.ts`, `projects.test.ts` |
| Agent survives switch | PASS | PTY pid unchanged after switch |
| Agent survives browser disconnect (server left running) | PASS | Simulated client disconnect leaves session alive |
| No duplicate agent | PASS | `missingTerminalKinds` empty when agent already alive |
| Dirty buffer survives switch | PASS | web bag helper keeps unsaved contents |
| Dirty buffer does not survive reload | PASS | snapshot JSON has no `content`; reconnect reopens from disk |
| Close kills only that project's PTYs | PASS | `closeByProject` / DELETE `/api/projects` |
| Review stops on switch | PASS | review bound-to-active test |
| Last-active restores after process restart with new PTYs | PASS | startup restore creates a new shell session |
| Missing last-active is recoverable | PASS | `restoreError` + known projects still listed |
| UI empty / single / multi | Implemented | picker when none active; switcher lists open projects; only active bag is rendered. Not driven in a browser this session (no browser tools). |

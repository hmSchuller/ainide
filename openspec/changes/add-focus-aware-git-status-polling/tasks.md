## 1. Remove Recursive Workspace Watching

- [x] 1.1 Remove normal workspace dependence on recursive chokidar watching and the file-limit polling fallback, while preserving workspace validation, explicit refreshes, Git status generation, and lifecycle cleanup; verify workspace and project tests pass without opening a recursive watcher.
- [x] 1.2 Keep Git status and directory-listing operations authenticated and scoped to the active workspace, and coordinate fresh Git snapshots with explorer reloads to avoid one poll spawning redundant Git commands per expanded directory; verify server API tests cover active-project isolation and Git status responses.
- [x] 1.3 Preserve explicit file-operation, ACP, PTY, and non-Git workspace behavior after watcher removal; verify existing server, terminal, ACP, and file-operation tests pass.

## 2. Add Focus-Aware Git Polling

- [x] 2.1 Add a browser polling scheduler for the active workspace that runs at most once per 2 seconds while the document is visible and the window is focused, performs one immediate refresh on activation, stops while inactive, and prevents overlapping requests; verify timer and focus/visibility tests cover start, stop, resume, and slow requests.
- [x] 2.2 Route scheduled refreshes through the existing authenticated Git status API and retain the last successful state after failures; verify API and browser tests cover authentication, failed requests, and retry on a later active tick.
- [x] 2.3 Compare normalized Git snapshots and apply only meaningful changes to Git summary and changed-file state; verify equal snapshots do not trigger redundant explorer reloads or external-file handling.

## 3. Reconcile Explorer And Editor State

- [x] 3.1 Reconcile the union of previous and current Git status paths, mark changed paths recent, and refresh the root plus affected expanded explorer directories; verify added, deleted, renamed, conflicted, and reverted status paths update visible explorer state.
- [x] 3.2 Probe only currently open text files during active polling so repeated edits with the same Git status classification are detected; verify clean buffers reload disk content and dirty buffers retain their edits while recording an external conflict.
- [x] 3.3 Preserve deleted-file, binary-file, unreadable-file, and non-Git handling from the existing external-change flow; verify focused browser tests cover each outcome and explicit manual refresh remains available.
- [x] 3.4 Unify polling results with any remaining explicit or ACP-triggered Git refresh events so stale responses cannot overwrite newer project state; verify project-switch and stale-request tests keep changes isolated to the active project.

## 4. Startup And Regression Verification

- [x] 4.1 Verify backend startup and project restoration no longer enumerate the entire workspace before becoming usable, using a large-workspace fixture or measured startup test that would exceed host watcher limits under the old implementation.
- [x] 4.2 Run the complete relevant server and web test suites plus `npm run typecheck` and `npm run build`, and verify no recursive watcher, polling fallback, or generated build artifacts remain required for startup.

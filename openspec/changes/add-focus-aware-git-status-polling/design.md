## Context

See `proposal.md` for the motivation. The server currently starts a recursive chokidar watcher for each active workspace and uses watcher events to trigger Git refreshes and browser-side external-file handling. The authenticated `/api/git/status` route already returns the Git snapshot needed by the browser, while the existing external-change handler already distinguishes clean buffers from dirty buffers and preserves conflicts.

Git status is a snapshot rather than a file event stream. Its path/status entries identify working-tree changes, but repeated edits to a file that remains modified can produce the same status entry. Preserving current editor conflict behavior therefore requires lightweight reads of open files in addition to the Git snapshot; it does not require enumerating the workspace.

## Goals / Non-Goals

**Goals:**

- Make the backend and workspace open path independent of recursive watcher enumeration.
- Poll Git state only while the browser window is visible and focused, at a maximum cadence of once per 2 seconds.
- Reconcile Git status changes with Git UI state, expanded explorer listings, recent paths, and open editor buffers.
- Preserve dirty-buffer conflict handling for changes that Git status cannot distinguish by status code alone.
- Keep polling requests bounded, serialized, authenticated, and safe across project switches.

**Non-Goals:**

- Detecting ignored-file changes or providing automatic external-change detection for non-Git workspaces.
- Adding a new public API or changing the shared Git status shape.
- Running Git polling while the browser is hidden or unfocused.
- Changing ACP, PTY, review, or explicit workspace file-operation lifecycles.

## Decisions

### Client-owned focus-aware scheduler

The web application will own one polling scheduler tied to the active project. It will use document visibility and window focus signals to start and stop a self-scheduling timer. Activation performs an immediate refresh; each later refresh is scheduled only after the previous request and reconciliation finish. An in-flight guard prevents a slow Git command or tab lifecycle race from producing concurrent requests.

This is preferred over a server-side interval because the browser is the only component that knows whether the user is actively looking at ainide. A server timer would continue running for hidden tabs and would keep a per-client polling lifecycle in the backend.

### Reuse the existing authenticated Git status route

Polling will call the existing `/api/git/status` endpoint and treat its response as the authoritative Git snapshot for the active project. No generic command endpoint or provider-specific integration is needed. The browser will compare a normalized snapshot of branch, repository state, file paths/statuses, and summary values before applying updates, avoiding redundant explorer reloads when nothing changed.

The server will stop creating the recursive chokidar watcher during workspace open, while retaining the existing explicit Git refresh route and Git status generation. Any server-side Git event publication that remains for explicit refresh or ACP activity will flow through the same browser reconciliation path rather than creating a second refresh mechanism.

### Reconcile status paths and probe only open files

When the Git snapshot changes, the client will derive the affected path set from the union of the previous and current status entries. It will mark affected paths recent, update Git state, and refresh the root plus relevant expanded explorer directories. For paths that are open in the editor, it will read disk content through the existing authenticated file API.

Open-file probes will also run for currently open text tabs during an active poll, because Git status can remain `modified` while file content changes again. A clean buffer will reload when disk content differs; a dirty buffer will retain its content and store the external disk content as a conflict. Deleted or unreadable files will retain the existing error and notice behavior. Probes are limited to open tabs and therefore do not recreate the whole-tree scan.

### Preserve explicit refresh and non-Git behavior

Manual explorer refresh, Git refresh, project switching, and existing file operations remain available. A non-repository response will update the existing non-Git status state but will not be interpreted as a file-change signal. This keeps the Git-based optimization honest and avoids inventing change information that Git cannot provide.

### Avoid redundant Git work during explorer reconciliation

The implementation will coordinate the freshly received Git snapshot with the subsequent expanded-directory reload so one poll does not cause an unnecessary full Git-status command for every directory listing. The existing directory listing and status APIs remain authenticated and workspace-scoped; the optimization may use a short-lived server snapshot or an equivalent request-local path, but must not expose paths outside the active workspace.

## Risks / Trade-offs

- [Git status does not report ignored files or content changes that leave the same status classification] → Keep explicit explorer refreshes and probe open files during active polls; document non-Git and ignored-file limitations in tests and user-facing behavior.
- [A large repository may make one Git status request take longer than 2 seconds] → Serialize requests, skip overlapping ticks, retain the last successful state on failure, and run no work while the app is inactive.
- [A focus or visibility event may race a project switch or request completion] → Capture the project/token context for each poll, reject stale results, clear timers on cleanup, and allow one immediate refresh after activation.
- [Removing watcher events reduces instant updates while the app is inactive] → Stop polling only when the app is hidden or unfocused, and perform an immediate refresh on reactivation.
- [Open-file probes add one read per open text tab] → Bound probes to the small set of open tabs and reuse the existing safe file API rather than scanning directories.

## Migration Plan

No persisted-data or protocol migration is required. Remove the normal workspace watcher startup and its file-limit fallback, add the focus-aware browser scheduler and reconciliation, then restart ainide. Existing session snapshots, project paths, open tabs, terminal sessions, and ACP sessions remain compatible. Rollback consists of restoring the prior watcher-backed workspace manager and removing the polling scheduler; no snapshot cleanup is needed.

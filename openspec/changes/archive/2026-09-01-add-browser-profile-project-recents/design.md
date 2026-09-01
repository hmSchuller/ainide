## Context

See `proposal.md` for the motivation. The server's `knownProjects` and
`activeProjectId` are process-wide and are persisted in `sessions.json`. The web client
already uses browser-local storage for layout preferences and `ainide:last-workspace`,
while `WorkspacePicker` currently receives the server's global known-project list.

The browser does not expose the name of the active browser profile to a web page. It does
give each profile an isolated storage area for a given origin, which is sufficient for a
profile-local organization feature.

## Goals / Non-Goals

**Goals:**

- Make the workspace picker's recent choices local to the current browser profile.
- Keep recent ordering deterministic, deduplicated, and updated only after successful
  project operations.
- Preserve manual absolute-path entry and the existing last-workspace fallback.
- Keep storage failures and malformed local data non-blocking.

**Non-Goals:**

- Discovering or displaying a browser profile name.
- Moving project or PTY ownership from the server to the browser.
- Providing independent active projects for multiple profiles using one server.
- Importing the server's global known-project list into every browser profile.
- Adding a server endpoint, account model, or persisted profile identifier.

## Decisions

### 1. Use origin-local browser storage as the profile boundary

Store recent project entries in `localStorage` under a dedicated ainide key. A browser
profile keeps its own value, while windows in that profile share it. This matches the
desired Work, Client, and Private separation without requiring the application to identify
the browser vendor or profile name.

`sessionStorage` is rejected because recents should survive browser restarts. Server-side
storage is rejected because the server cannot reliably identify a browser profile and the
feature does not need cross-browser synchronization. The existing `last-workspace` key
remains separate as a compatibility fallback.

### 2. Store self-contained, canonical project entries

The browser list stores an ordered array of entries with the resolved project identity,
workspace path, and display name:

```text
{
  projectId: "/resolved/project/path",
  rootPath: "/resolved/project/path",
  name: "project"
}
```

The successful project mutation response is the source for new entries, so aliases and
relative-looking input cannot create duplicate entries for the same resolved workspace.
Remembering an entry removes any existing entry with the same `projectId`, refreshes its
metadata, and places it at the front. The list is intentionally not copied from
`knownProjects`; entries enter it through successful use in the current profile.

The storage reader validates the JSON shape, ignores malformed entries, and treats a
missing or unreadable value as an empty list. It does not attempt filesystem validation
while reading; a stale path is handled by the normal project-open error path.

### 3. Keep recent history at app scope, not in project UI bags

Recent projects describe the browser profile, not an individual project. A small web
helper should own serialization, parsing, and the pure deduplication/order operation,
following the existing layout-preference storage pattern.

The app reads the list once during startup and passes the current value to both workspace
picker instances. User-initiated successful open and switch flows record the returned
project after the server operation succeeds. Startup restoration does not automatically
record the server's global active project as a new profile recent, which avoids importing
another profile's last server selection.

The existing last-workspace value remains an initial path hint only when the profile has
no local recent entries. A successful user-initiated project operation can continue to
refresh that compatibility key; bootstrap restoration should not overwrite it.

### 4. Keep picker behavior separate from open-project behavior

`WorkspacePicker` changes its displayed project choices from global known projects to
profile-local recent projects. It continues to submit an absolute path through the same
server validation route. The top-bar project switcher continues to represent live
server-global open projects, because changing that registry would exceed this change's
scope and would imply profile isolation that does not exist.

Selecting a stale recent entry leaves it in the list when opening fails. This preserves
the existing error path and avoids silently deleting a project that may become available
again; explicit recent-entry removal is deferred.

### 5. Treat local persistence as best effort

Storage access and serialization are wrapped so quota errors, privacy-mode restrictions,
and malformed values cannot prevent opening a workspace. The UI falls back to the manual
path field when recent data is unavailable. Recent projects are convenience metadata and
are never sent to the server as credentials or authorization context.

## Risks / Trade-offs

- **Risk:** Two browser profiles can still race over the server's one global active
  project. -> **Mitigation:** Document and test that only the recent lists are isolated;
  do not present this feature as independent profile sessions.
- **Risk:** A project deleted or moved on disk remains in the recent list. -> **Mitigation:**
  Keep the entry visible, surface the existing open error, and retain manual path entry so
  the user can correct or reopen it.
- **Risk:** Clearing browser site data, changing origins, or switching between development
  and production origins resets or separates recents. -> **Mitigation:** Keep the feature
  explicitly browser-origin local and preserve `last-workspace` as a lightweight fallback.
- **Risk:** A browser profile can contain a large number of entries over time. ->
  **Mitigation:** Store only small project metadata and leave list retention policy
  explicit for a later change rather than silently dropping user history now.

## Migration Plan

No server or disk migration is required. Existing `sessions.json` data remains readable by
the unchanged server. On first use, a browser profile starts with an empty local recent
list and can still use its existing `ainide:last-workspace` path hint; projects become
profile recents after successful use. Rollback only requires reverting the web behavior,
and the extra browser-local key can safely remain unused.

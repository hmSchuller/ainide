## Context

See `proposal.md` for the motivation. The current `WorkspacePicker` is a path-only
surface, while `WorkspaceManager.validate()` resolves an existing absolute path and the
existing file-listing APIs require an already selected workspace. The picker therefore
needs a separate pre-workspace directory operation rather than reusing the active
workspace explorer route.

The browser cannot use an operating-system folder dialog to return a server filesystem path.
The ainide server is local by default, already has a session-token boundary, and already
accepts arbitrary user-accessible absolute paths for project opening.

## Goals / Non-Goals

**Goals:**

- Make the browser picker a predictable directory-navigation surface that starts at the
  server user's home directory on every open.
- Make tilde paths and canonical absolute paths equivalent for browsing and project open.
- Let users traverse any directory accessible to the server process, one level per explicit
  navigation action.
- Make direct child suggestions, keyboard completion, and manual path entry use the same
  path semantics.
- Keep browsing side-effect free: it must not open projects, create sessions, or modify
  recent-project storage.

**Non-Goals:**

- A native OS folder dialog in the browser client.
- A configured home-directory or workspace allowlist.
- Recursive filesystem search, descendant preloading, or project discovery by scanning the
  filesystem.
- Returning file contents, file metadata beyond what directory selection needs, or running
  commands during browsing.
- Creating, cloning, or scaffolding projects.
- Isolating active projects or PTYs between browser profiles.

## Decisions

### 1. Normalize tilde paths on the server

Introduce one server-side path normalization boundary used by both project opening and
directory browsing. Expand only a leading `~` or `~/` (using the platform separator where
applicable) to `os.homedir()`. Reject `~other-user` and relative paths. Resolve the result
with the platform path implementation, then use `realpath` and directory validation before
returning or opening it.

The server is the only reliable authority for the process user's home directory. Client-side
expansion is rejected because the browser cannot know whether its home directory matches the
server's home directory. Shell expansion is rejected because invoking a shell would add
quoting, environment, and command-execution behavior to a path-only operation.

The response should carry canonical absolute paths and the canonical home path needed by
the client to render paths as `~`. Recent-project storage continues to use the canonical
project path returned after a successful project operation.

### 2. Add an authenticated pre-workspace directory-children API

Add a dedicated authenticated HTTP operation for browsing directories, conceptually:

```text
GET /api/workspace/children?path=<directory>&query=<optional-final-segment>
```

The `path` parameter identifies the current existing directory and may use `~` syntax. The
optional `query` filters only the names of that directory's immediate child directories.
The response contains the canonical current path, canonical parent path, canonical home
path, and child entries with names and canonical paths. An empty query returns all
immediate child directories.

This endpoint deliberately does not use the workspace-relative safe resolver because it is
used before a workspace exists and must support arbitrary paths. Its safety boundary is
different and explicit: require the session token, resolve and validate the requested
directory, read only one directory level, return no contents, and rely on the server
process's normal operating-system permissions. It is not a generic filesystem read or
command-execution endpoint.

Directory entries include hidden directories and do not apply the workspace explorer's
project-specific ignore list. Directory symlinks are classified by their targets and use
the same canonical realpath behavior as project opening, so users can navigate accessible
symlinked directories without creating a second project identity.

### 3. Use one-level navigation as the UI state machine

Each picker instance maintains its current canonical directory, displayed path, child list,
input value, suggestion state, and a monotonically increasing request generation. Mounting
or reopening the picker initializes the current directory to the server home path and loads
its immediate children. It does not restore the previous picker location.

The interaction is:

```text
picker opens
    -> current = ~
    -> list children(~)
    -> choose child
    -> current = chosen child
    -> list children(chosen child)
```

Typing a partial final segment asks for children of its parent with a local name query. It
never asks the server to search below a matching child. Selecting a suggestion navigates to
that child; it does not open the project. Home and Parent replace the current path and load
one new child list. A refresh, if exposed by the UI, repeats only the current-level request.

The path field behaves as a combobox. Arrow keys select suggestions, Tab completes the
active directory without opening it, and Enter navigates an active suggestion or an exact
typed directory. Opening the selected/current directory remains an explicit action that
uses the existing project-open route. A direct recent-project choice bypasses browsing and
uses its stored canonical path.

No directory-list cache or background child preload is required for the first version.
Navigation requests can be debounced for typed suggestions, while explicit navigation is
immediate. Each response is applied only if its generation still matches the current picker
state, preventing slow requests from replacing a newer directory's children.

### 4. Keep browser recents separate from browse state

The profile-local recent-project list remains a set of direct-open shortcuts. It is not a
filesystem tree and is not used to choose the initial browse path. The browser
`ainide:last-workspace` key is no longer read or written. Existing values may remain inert
in local storage; profiles without recents simply begin at `~`.

Successful open and switch operations continue to record the canonical project returned by
the server. Directory listing, suggestion, completion, and navigation operations never
record or reorder recents.

### 5. Preserve the existing project operation boundary

The picker only discovers and selects a path. The existing project-open operation remains
responsible for final validation, project activation, session persistence, and returning the
canonical workspace identity. This avoids registering a directory merely because a user
visited it and keeps failed selections from changing server or browser project state.

## Risks / Trade-offs

- **Risk:** Arbitrary directory browsing exposes immediate directory names to an
  authenticated browser client. -> **Mitigation:** Keep the server bound to `127.0.0.1` by
  default, retain the session-token check, return directory navigation metadata only, and
  perform no recursive scan or file-content read.
- **Risk:** A directory or symlink can disappear between listing and navigation. ->
  **Mitigation:** Treat listing and opening as separate operations, revalidate on every
  request, preserve the typed path, and show a recoverable error.
- **Risk:** Slow responses can show children for a directory the user has already left. ->
  **Mitigation:** Track request generations and discard stale responses.
- **Risk:** Large directories can produce a large immediate-child response. ->
  **Mitigation:** Return directories only, avoid recursion, and render the result as a
  scrollable or virtualized list if needed; do not introduce a depth-based truncation.
- **Risk:** Home shorthand can be ambiguous across browser and server machines. ->
  **Mitigation:** Expand and canonicalize only on the server, and render shorthand from the
  server-reported home path.
- **Risk:** Removing the `last-workspace` browser fallback makes old profiles start at home
  instead of their previous path. -> **Mitigation:** Make the behavior intentional and
  deterministic; successful future opens populate the profile-local recent list.

## Migration Plan

Deploy the additive directory-children API with the web picker changes. Existing project
session snapshots and server-global project behavior remain unchanged. Existing
profile-local recent entries remain usable; the browser `last-workspace` value is ignored
and no migration is needed. If the change is rolled back, the old path-only picker can
continue using the existing project-open route and the unused local-storage key can remain
harmlessly present.

## Context

See `proposal.md` for the motivation and user-facing scope. The current Git service exposes file
statuses and aggregate counts from `HEAD`, while the web client already polls that status and keeps
open tab content, saved content, and external-change conflicts separate. The editor currently uses a
normal Monaco editor in each pane; its existing compare affordance is limited to showing an external
disk version beside a dirty buffer.

The new capability crosses the shared protocol, server Git boundary, polling reconciliation, and
both editor panes. It also needs a stable meaning for "Git changes" when auto-save, untracked files,
renames, and conflicts are involved.

## Goals / Non-Goals

**Goals:**

- Compare the committed `HEAD` tree with the current visible editor buffer.
- Keep line markers live while the user edits, without waiting for auto-save.
- Offer a read-only detailed comparison without replacing or duplicating the editable tab.
- Keep the behavior consistent in either editor pane and across project switches.
- Keep all Git and filesystem access local, authenticated, active-workspace scoped, and path-safe.
- Reuse the existing Git polling and external-change conflict lifecycle.

**Non-Goals:**

- Staging, unstaging, committing, reverting, or resolving conflicts.
- A selectable staged-versus-unstaged comparison scope in the first version.
- Repository-wide review changes; Difit remains the Review-mode surface.
- Semantic, token-aware, or language-server diffs.
- Text comparison for binary files.
- Persisting baseline contents, line markers, or detailed-diff UI state in session snapshots.

## Decisions

### 1. Use `HEAD` as the single initial baseline

The default comparison is `HEAD -> visible buffer`. This represents all local work in one view,
including staged changes and unstaged changes, and it matches the content the user is actively
editing. The current buffer is authoritative for markers and the detailed diff even during the
short auto-save window or while an external conflict is displayed.

The first version will not expose staged, unstaged, last-commit, or branch comparison selectors in
Edit mode. Those scopes already belong to Review mode and adding them here would make the meaning of
gutter markers ambiguous.

**Alternative considered:** Compare `HEAD` to disk. Rejected because markers would lag behind visible
unsaved edits and could appear to contradict the editor.

**Alternative considered:** Add a baseline selector immediately. Rejected because it duplicates the
Review scope model before the simpler per-file workflow has proven useful.

### 2. Return baseline content and file-state metadata, not only server hunks

The authenticated file-comparison response will return the Git baseline content when it is textual,
plus metadata describing the path, baseline kind, Git status, rename source when applicable, HEAD
identity, and exceptional state. The client will compare that baseline with the tab's visible content
to derive both gutter markers and the detailed diff input.

The shared model should distinguish at least these baseline states:

- `head`: a tracked file has textual content at the current `HEAD` revision.
- `empty`: an untracked file uses an empty baseline.
- `unavailable`: there is no valid committed baseline or text comparison, with a reason such as
  non-repository, no-`HEAD`, binary, or conflict.

The existing Git status model should expose the current `HEAD` identity so a commit reset, amend, or
branch change invalidates cached baseline data even when the file list and aggregate counts happen to
remain unchanged. Rename status should retain the previous path instead of discarding it during
porcelain parsing.

**Alternative considered:** Return only `git diff` hunks. Rejected because server hunks describe disk
content, while the editor can contain a newer unsaved buffer; the client would then show stale or
misaligned markers.

**Alternative considered:** Send the visible buffer to the server for every comparison. Rejected
because baseline retrieval is sufficient, avoids repeated content uploads, and keeps the line-level
comparison derived from the editor's existing local state.

### 3. Keep Git access behind a fixed, active-workspace API

Add an additive authenticated file-comparison route under the existing Git API boundary. The route
accepts a single workspace-relative path and always compares against the server-selected `HEAD`; the
client cannot provide an arbitrary revision or command. The active workspace manager validates the
path with the existing safe resolver before invoking fixed Git operations, including for deleted
files whose current working-tree path no longer exists.

Git commands will continue to use argument arrays rather than shell interpolation and will terminate
path arguments with `--` where applicable. A request for an invalid path is rejected before any Git
or filesystem read. The route does not expose inactive project roots because all file comparison is
resolved through the active project manager.

### 4. Derive line markers in the browser from a pure line-diff helper

The web client will use a deterministic line-based diff helper that accepts baseline text and the
current visible text and returns current-buffer ranges for additions, modifications, and deletions.
Deletion-only hunks will carry an anchor line so deletions at the beginning, middle, and end of a
file remain visible in the gutter. The helper will be unit-tested independently of Monaco.

This keeps markers accurate for unsaved edits and avoids adding a diff dependency solely to support
gutter state. The detailed view will use the same two strings as its original and modified inputs,
so markers and the side-by-side view cannot disagree about which buffer is being reviewed.

### 5. Keep detailed comparison transient and local to an editor pane

The existing editor tab and pane model remains the source of truth for editable content. A pane-local
Git diff view temporarily replaces the normal editor for its active tab and presents both sides as
read-only, labeled `HEAD` and `CURRENT BUFFER`. Returning to the editor restores the same tab and
buffer rather than opening a second tab or writing anything to disk.

Comparison metadata and baseline content are transient client state keyed by the active project and
path. They are not written to `ProjectSessionSnapshot`; switching projects clears or invalidates
them, while the existing tab and pane snapshot behavior remains unchanged.

### 6. Integrate with existing polling and conflict handling

Git status reconciliation remains the trigger for external Git state. A changed HEAD identity
invalidates all baseline caches for the active project; changed paths invalidate their comparison
entries. Open files can then re-request baseline data as needed. A tab content change only reruns the
local line comparison and does not make a network request.

The existing request-generation, project-id, and session-token checks will guard asynchronous
baseline responses. Existing clean-tab disk reloads continue to update the visible buffer before
markers are derived. Existing dirty-tab conflict handling continues to retain the visible buffer;
the Git comparison is labeled as being against that buffer rather than treating it as disk state.

### 7. Treat exceptional states as explicit UI states

Untracked files in a repository with `HEAD` use an empty textual baseline. A tracked deleted file can
show its historical `HEAD` content against an empty current side in the detailed view, but has no
ordinary current-buffer gutter markers. A renamed file compares the new visible path with the old
path's `HEAD` content and labels both paths. Conflicted, binary, non-repository, and no-`HEAD` files
show their existing status or an explanatory unavailable state instead of an ordinary text diff.

This deliberately favors truthful state over attempting to manufacture line markers for data that
does not have a reliable two-way text baseline.

## Risks / Trade-offs

- [Risk] A line-based diff can produce unintuitive hunks for heavily reordered code. -> [Mitigation]
  Keep the markers deliberately coarse, use the same text inputs in the detailed diff, and leave
  token-aware or semantic diffing out of scope.
- [Risk] Large files make baseline responses and client diffing expensive. -> [Mitigation] Fetch
  comparison data only for open text files, cache it by project/path/HEAD identity, and dispose of
  editor decorations when a tab or pane changes.
- [Risk] Git HEAD can change without changing status counts. -> [Mitigation] Include a HEAD identity
  in Git status and comparison metadata so resets, amends, and branch transitions invalidate caches.
- [Risk] Rename detection can make a new path look entirely added if its old path is lost. ->
  [Mitigation] Preserve the previous path in Git status parsing and use it when retrieving the
  historical baseline.
- [Risk] A dirty buffer may differ from the version currently on disk. -> [Mitigation] Label the
  comparison as `CURRENT BUFFER`, preserve the existing conflict banner, and never reload or save as
  a side effect of opening the diff.
- [Risk] A malformed or escaping path could turn a Git comparison into an unintended filesystem
  access. -> [Mitigation] Reuse the safe resolver before all reads, use fixed `execFile` arguments,
  require the session token, and add focused traversal and symlink tests.
- [Risk] Monaco decoration or diff-editor lifecycles can leak stale markers. -> [Mitigation] Tie
  decorations and diff models to the active editor path, clear them on replacement and unmount, and
  verify both panes with focused component and browser checks.

## Migration Plan

The API and shared types are additive. No persisted session snapshot migration is required because
baseline content, comparison metadata, markers, and diff-view state are transient. Existing clients
continue to use the current Git status and file APIs if the new comparison route is unavailable.

Implementation should ship server/shared comparison support and web rendering together, followed by
focused tests and a manual two-pane smoke check. Rollback is limited to removing the new comparison
route, transient client state, and editor UI; existing Git status, auto-save, conflict, and Difit
Review behavior remain independent.

## Why

ainide currently shows which files changed and provides repository-wide Difit review, but an open
file does not show where its Git changes occur. Users must leave the Edit surface or manually
compare versions, which makes small edits and agent changes harder to inspect in context.

## What Changes

- Add an Edit-mode Git change view for text files open in either editor pane.
- Display subtle line-level added, modified, and deleted markers in the Monaco editor gutter.
- Provide an explicit per-file side-by-side diff action using the committed `HEAD` version and the
  currently visible editor buffer.
- Make the comparison state update as Git status changes and as the visible buffer changes, while
  clearly indicating when the buffer includes unsaved edits.
- Represent untracked files with an empty baseline and handle deleted, renamed, conflicted, binary,
  non-repository, and no-`HEAD` states without presenting a misleading ordinary diff.
- Add an authenticated, workspace-safe protocol for obtaining the Git baseline or file-level diff
  data needed by the editor.
- Preserve existing auto-save, external-change conflict handling, split panes, tab state, and
  repository-wide Difit Review behavior.

## Capabilities

### New Capabilities

- `editor-git-diff`: Show and inspect Git changes for files opened in the Edit surface, including
  line-level markers, explicit per-file comparison, baseline semantics, and exceptional file states.

### Modified Capabilities

## Impact

- `packages/shared`: Add protocol and domain types for file-level Git comparison data if needed.
- `apps/server/src/git.ts`, `workspace.ts`, and `server.ts`: Obtain Git baselines or file-level diff
  information through fixed Git operations and expose it through the authenticated active-workspace
  API, using the existing safe path boundaries.
- `apps/web/src/api.ts`, state helpers, and `components/Editor.tsx`: Load comparison data, reconcile
  it with live Git polling and visible buffers, render Monaco gutter markers, and open the detailed
  diff view in both panes.
- Web and server tests: Cover baseline and file-state semantics, path validation, polling updates,
  unsaved buffers, and editor-pane behavior.
- No cloud service, provider integration, or required external dependency is expected; the existing
  Monaco runtime and local Git process remain the underlying mechanisms.

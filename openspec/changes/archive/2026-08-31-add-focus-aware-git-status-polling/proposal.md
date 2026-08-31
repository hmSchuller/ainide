## Why

ainide recursively watches every non-ignored workspace directory so it can react to external file changes immediately. Large Git workspaces can exhaust macOS watcher descriptors or spend significant startup time scanning and polling files, delaying the point at which the cockpit becomes usable. Git already provides the change set needed by the primary review and explorer workflows, so the browser can refresh that state only while the user is actively working in ainide.

## What Changes

- Replace the active workspace's recursive file watcher with browser-driven Git status refreshes for Git-backed workspaces.
- Poll the existing authenticated Git status API every 2 seconds only while the ainide document is visible and the browser window is focused.
- Trigger an immediate status refresh when the window regains focus or becomes visible, without creating overlapping requests.
- Apply detected Git changes to the Git summary, explorer refresh state, recent-change indicators, and open-file external-change handling without overwriting dirty buffers.
- Stop background refresh work while ainide is hidden or unfocused, while retaining explicit explorer and Git refresh actions.
- Allow the backend to become usable without recursively enumerating the entire workspace or depending on chokidar watcher limits.
- Preserve explicit workspace file operations, terminal and ACP behavior, and support for opening non-Git workspaces; non-Git workspaces retain manual refresh behavior instead of gaining Git-based change detection.

## Capabilities

### New Capabilities

- `workspace-git-polling`: Focus-aware Git status polling and reconciliation of external workspace changes.

### Modified Capabilities

- `workspace-explorer`: Git-backed explorer and recent-change state updates from active polling rather than a recursive filesystem watcher.

## Impact

- `apps/web`: Add focus/visibility-aware polling, request coordination, and reconciliation of Git status changes with explorer and editor state.
- `apps/server`: Remove or bypass recursive chokidar startup for normal workspace operation while retaining the existing authenticated Git status route and explicit refresh behavior.
- `packages/shared`: No protocol shape change is expected unless a smaller change-notification payload is needed during implementation.
- Tests: Add browser lifecycle and polling tests, Git-status reconciliation tests, and startup coverage proving large workspaces do not require a recursive watcher before the backend is usable.

## Why

Nested folders in the workspace explorer show "Loading..." indefinitely because the tree renders expanded directories before their listings are fetched, and nothing reliably schedules that fetch after session restore or project switch. The backend already lists local directories correctly; this is a frontend lifecycle gap that became visible with persisted `expandedPaths` from multi-project sessions.

## What Changes

- Ensure every expanded explorer directory has its children loaded from `/api/files`, not only the workspace root.
- Load missing directory listings when `expanded` state is restored from a session snapshot or in-memory project bag.
- Load directory listings when the user expands a folder (opening), not only when the path is absent from the click-handler closure at toggle time.
- Include expanded-but-not-yet-cached paths when the user triggers explorer refresh.

## Capabilities

### New Capabilities

- `workspace-explorer`: Lazy-loaded directory tree in the cockpit explorer, including restore and refresh behavior for nested folders.

### Modified Capabilities

<!-- None. Editor split-pane explorer click behavior is unchanged. -->

## Impact

- `apps/web/src/components/Explorer.tsx`: directory load scheduling on expand and restore.
- `apps/web/src/App.tsx`: explorer refresh should cover expanded paths.
- No server or shared-protocol changes; `/api/files` is already correct.

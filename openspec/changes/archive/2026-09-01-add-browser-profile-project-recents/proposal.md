## Why

The server currently exposes one global list of known projects, so work, client, and
private repositories become mixed together in the workspace picker. Browser profiles
already provide isolated local storage, making them a natural boundary for lightweight
recent-project organization without introducing accounts or server-side profile
identity.

## What Changes

- Store a browser-profile-local list of recently opened projects, deduplicated and ordered
  by most recent successful use.
- Show the local list as the workspace picker's recent projects and update it after a
  project is successfully opened or switched to.
- Keep manually entering an absolute workspace path available when a project is not in
  the current profile's recent list.
- Preserve the existing `last-workspace` value as a fallback for profiles with no recent
  list, so existing installations do not lose their last-project affordance.
- Keep the server's global open-project registry, active-project pointer, PTY ownership,
  and `sessions.json` persistence unchanged.
- Explicitly do not infer or display the browser's profile name, and do not promise
  independent active projects when multiple profiles use the same ainide server.

## Capabilities

### New Capabilities

- `browser-profile-project-recents`: Browser-profile-local recent project history and
  workspace-picker behavior.

### Modified Capabilities

## Impact

- `apps/web`: Add a small local-storage recent-project boundary and connect it to the
  workspace picker and successful project open/switch flows.
- `apps/web` tests: Cover storage parsing, deduplication/order, fallback behavior, and
  profile-local picker contents.
- `packages/shared` and `apps/server`: No protocol or persistence changes are required.
- Existing server-global project and terminal semantics remain in effect; this change is
  an organization feature, not a browser-profile isolation boundary.

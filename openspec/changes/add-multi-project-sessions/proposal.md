## Why

ainide can only hold one workspace at a time, and opening another path kills every PTY and stops review. Working across several local projects therefore means losing running agents. The cockpit should keep one visible project while other projects stay live in the ainide process, including across browser close/reopen, and restore enough per-project UI to hop back quickly.

## What Changes

- Allow several projects to be open in one ainide process, with exactly one active (visible) project at a time.
- Keep each open project's PTY sessions alive when switching away or when the browser disconnects; do not tear them down until the user closes that project or the ainide process exits.
- Add a project switcher (and keep an add/open flow) so the user can open another root without restarting ainide.
- Persist a per-project session snapshot (project list, last active, open file paths, pane/explorer layout, terminal kinds) under the existing local config directory so a later ainide start can resume the set.
- Restore editor tabs from saved paths and reload file contents from disk. Do not persist unsaved Monaco buffers.
- Scope filesystem APIs, Git, watchers, and events to the active project; hidden projects keep PTYs running but do not drive the visible explorer/editor.
- Stop Difit when leaving a project; start review again against the newly active root when requested.
- **Behavior change:** `/api/workspace/open` must no longer kill unrelated project terminals. Switching or opening another project is not a global teardown.

## Capabilities

### New Capabilities

- `project-sessions`: Multiple live projects in one ainide process, one visible cockpit, PTY survival across switch and browser reconnect, and disk-backed session snapshots for resume.

### Modified Capabilities

- `review-mode`: Review is bound to the active project; switching projects stops the previous Difit process. "No workspace open" remains: review cannot start without an active project.

## Impact

- `apps/server`: workspace/terminal/review managers become project-scoped; session snapshot I/O; workspace-open no longer closes every PTY; event payloads must identify the project so hidden-project activity cannot mutate the active UI.
- `packages/shared`: project identity, session snapshot, and event/protocol types.
- `apps/web`: project switcher, per-project UI state swap, reconnect that attaches existing terminals instead of spawning duplicates, persistence-aware boot.
- Config file `~/.config/ainide/sessions.json` (alongside existing `config.json`). No tmux, no extra daemon, no cloud. Session tokens stay in-memory for the process lifetime.

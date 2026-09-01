## Why

ACP agents are configured globally (`acpAgents`), so every project's "start an agent" picker offers every configured agent. A user who maintains several agents globally cannot restrict a given project to the subset they actually use there. This adds a per-project way to disable specific agents, so each project's picker offers only the agents relevant to it.

## What Changes

- Add a **per-project agent banlist**: mark specific configured ACP agents as disabled for a given project. Default (no banlist) = all agents enabled.
- **Persist** the banlist in the global ainide config under a new `projects` section keyed by project root path (e.g. `projects["/abs/path"].disabledAgents`).
- Add a **config write path** (atomic file write + in-memory update). Config is currently read once at startup and treated as immutable; a UI toggle must persist and take effect without a restart.
- New **API**: read a project's effective agent list (`all` + `disabled`) and update its banlist. The project root path is passed in the request **body** (not the URL) and validated against known/open projects.
- The **ACP provider picker** filters out agents disabled for the active project.
- A **"Project settings…"** entry in the project switcher opens a dialog to toggle which agents are disabled.
- Scope: **ACP agents only** (the PTY `agentCommand` is unaffected). Affects **new sessions only**; already-running sessions are unchanged.

## Capabilities

### New Capabilities
- `project-agent-settings`: Per-project enablement (banlist) of configured ACP agents — the config shape, the persistence/write path, the read+update API, validation, and the settings dialog.

### Modified Capabilities
- `acp-agent-sessions`: The "start an agent" picker now offers only configured providers that are **enabled for the active project** (configured minus project-disabled), instead of every configured provider.

## Impact

- `apps/server/src/config.ts` — new `projects` config field, defensive parse, and an atomic write path.
- `apps/server/src/server.ts` — new read/update endpoints; wire the in-memory config mutation.
- `apps/server/src/acp/manager.ts` — `providers()` becomes project-aware (filters the active project's banlist).
- `packages/shared/src/index.ts` — shared types for the agent-settings request/response.
- `apps/web/src` — project-switcher "Project settings…" entry, the settings dialog, picker filtering, and the API client.
- `~/.config/ainide/config.json` — new `projects` section (backward compatible; absent = all enabled). This is the server's own config directory, not workspace filesystem access, so the workspace safe-resolver rules do not apply to it.

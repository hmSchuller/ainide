## Context

ACP agents are defined once, globally, in `~/.config/ainide/config.json` under `acpAgents` (see `apps/server/src/config.ts`). The config is loaded a single time at startup (`apps/server/src/server.ts:144`) and passed by shared reference into `AcpSessionManager` (`server.ts:178`) and `TerminalManager`. `AcpSessionManager.providers()` (`apps/server/src/acp/manager.ts:113`) reads `this.options.config.acpAgents` live off that object and returns every agent, with no project context. The picker (`apps/web/src/components/AcpProviderPicker.tsx`) shows whatever `providers()` returns.

Projects are identified by their absolute `rootPath` everywhere (`ProjectRegistry`, `apps/server/src/projects.ts`); `projectId === rootPath`. There is currently **no write path** to the config file — it is read-only for the life of the process.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Per-project banlist of configured ACP agents, persisted and effective without a restart.
- A small, safe API to read and update a project's banlist.
- Picker offers only the agents enabled for the active project.
- A project-switcher entry to edit the banlist.

**Non-Goals:**
- No per-project *definition* of agents (commands/args/env stay global).
- No effect on the PTY `agentCommand` or on already-running sessions.
- No team-shared / in-repo config (the banlist lives in the user's global config, not the project directory).

## Decisions

### 1. Storage: global config, keyed by project root path

The banlist is stored in the global config under a new `projects` section:

```json
{
  "acpAgents": [ { "id": "opencode", "label": "OpenCode", "command": "opencode", "args": ["acp"] } ],
  "projects": {
    "/Users/me/foo": { "disabledAgents": ["gemini"] }
  }
}
```

- **Why here:** the user chose the global config as the home. It keeps a single source of truth next to `acpAgents`, adds no file to the project directory, and reuses the config the server already owns.
- **Keyed by `rootPath`:** consistent with the rest of the app, where `projectId === rootPath`. A moved project getting a fresh (empty) banlist matches how its mode/panes state already behaves.
- **Extensible shape** (`projects: { path: { ... } }`) rather than a flat `projectDisabledAgents: { path: [...] }`: costs nothing now and leaves room for future per-project settings beyond agents.
- **Alternatives considered:**
  - *`sessions.json` snapshot* — pragmatic and already per-project, but it is UI/session state, not configuration; mixing a durable user preference into session state is a category stretch.
  - *Project-local `.ainide.json`* — the "most correct" home if the banlist should be committable/team-shared, but it is a larger lift (new file format, safe-resolver writes, precedence rules) and the user did not want it to travel with the repo.

### 2. Semantics: banlist, default all enabled

A project stores the set of agents it **disables**; absence or an empty set means all agents are enabled. This is opt-out: you only ever remove agents from a project, never enumerate the ones you want. New agents added globally appear in every project by default.

### 3. Config write path (the main new work)

Because the config is read-once and currently immutable, a UI toggle needs both halves:

- **Atomic file write** — write to a temp file in the same directory, then rename over `config.json`, so a crash never leaves a truncated config.
- **In-memory mutation** — update the shared `config` object's `projects` entry so `providers()` (which reads it live) reflects the change immediately, no restart.

The write is a fixed server-side operation on the server's own config directory — not workspace filesystem access — so the workspace safe-resolver rules do not apply to it.

### 4. API: root path in the body, not the URL

```
GET   /api/project/agents?projectId=<active>      → { all: [{id,label}], disabled: string[] }
PATCH /api/project/agents                          body: { rootPath, disabledAgents: string[] }
```

- The `rootPath` is passed in the **request body** (a JSON string), not as a URL path segment. A `rootPath` is full of `/`, so it cannot be a path segment, and URL-encoding it fights the router. In the body it is just a string — safe for spaces, non-ASCII, quotes, etc.
- One read endpoint feeds both the picker (`all − disabled`) and the settings dialog (`all`, pre-unchecking `disabled`), so the client keeps no separate banlist state.

### 5. In-memory structure: a `Map`, not a plain object

The in-memory `projects` structure is held as a `Map<string, …>` (or `Object.create(null)`), converting to/from a plain object only at the file boundary. This avoids the JavaScript gotcha where `plainObject["__proto__"] = value` invokes the prototype setter instead of creating an own property, which would silently drop the entry on `JSON.stringify`. `JSON.parse` is safe (define-property semantics); the write path is the risk.

### 6. Validation: match against known/open projects

An update's `rootPath` is accepted only if it is a **known or open project** (`ProjectRegistry`). The server never treats a client-supplied `rootPath` as a filesystem path to resolve. This removes any path-traversal surface and prevents junk config keys. Disabled identifiers that are not in `acpAgents` are ignored (inert), so a later-removed agent leaving a stale ban id is harmless.

### 7. `providers()` becomes project-aware

`providers()` filters the active project's banlist so the picker receives only enabled agents. The full unfiltered list is still available to the settings dialog via the read endpoint.

## Risks / Trade-offs

- [Config file corruption on write] → Atomic temp-file + rename; never write in place.
- [Banlist not migrated when a project moves] → `ProjectRegistry.migrateKnownPath` migrates session state but not the global-config banlist, so a moved project starts with an empty banlist. Acceptable and consistent with "rootPath is identity"; noted, not auto-fixed.
- [Concurrent config writes] → Single local server, single writer; the rename is atomic. No locking needed for the local-first threat model.
- [Stale ban ids after an agent is removed globally] → Inert by design (ignored on evaluation); optionally pruned on write.

## Migration Plan

- Backward compatible: a config with no `projects` section parses as "no banlists" (all agents enabled). No data migration required.
- Rollback: removing the `projects` section (or the code) restores the previous "all agents everywhere" behavior; existing `acpAgents` are untouched.

## Open Questions

- Should a project move (path change) carry its banlist over, or reset it? Current design resets it (consistent with rootPath-as-identity). Deferrable — does not change the spec or approach.

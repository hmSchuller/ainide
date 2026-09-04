# Design: ACP Session Rollover and Resume

## Context

See `proposal.md` for motivation. Current state that shapes the approach:

- The ACP manager runs **one provider process per ainide session** (`LiveAcpSession` holds a transport + protocol adapter). `create()` starts the process, `initialize`s, then calls `session/new`. Descriptors persist `acpSessionId` and drive `restore()` after restart, which calls `session/load` (when `canLoad`) or `session/resume` (when `canResume`).
- The composer already has a caret-aware slash-autocomplete surface (`acp-command-autocomplete.ts`, `AgentWorkbench.tsx`) whose suggestions are the provider-advertised `availableCommands`; selecting one inserts text.
- ACP v1 methods relevant here (all present in `@agentclientprotocol/sdk` 1.4): `session/new`, `session/load`, `session/list`, `session/close`.

Empirical probes against the installed providers (opencode 1.18.23, cursor `agent` CLI):

- Both speak NDJSON over stdio (ainide's transport already uses `ndJsonStream`).
- Both advertise `available_commands_update` — provider command plumbing already works.
- **opencode** advertises `sessionCapabilities { close, fork, list, resume }` and `loadSession: true`. `session/list` returns real history (`sessionId`, `cwd`, `title`, `updatedAt`, most-recent-first). `session/load` **replays the full transcript** as a burst of `session/update` notifications (messages, thoughts, tool calls) followed by `available_commands_update`. One connection hosts multiple concurrent `session/new` sessions.
- **cursor** advertises only `list` plus `loadSession: true`. `session/list` currently returns `[]`. `session/delete` is not implemented by either provider (out of scope).
- Capability flags can over-promise (cursor `list` → empty), so runtime results, not just flags, drive UI states.

## Goals / Non-Goals

**Goals:**

- Roll a live session over to a fresh provider context in place: same workbench card, same provider process, new provider session.
- Let the user start an agent from a recent provider session: the picker shows recent sessions per provider and loading one renders the replayed transcript.
- Keep rollover and resume inside the existing persistence, event, and restore machinery so restart behavior stays unchanged in spirit.
- Degrade gracefully per provider (no list, empty list, slow list, no close).

**Non-Goals:**

- Deleting, forking, or otherwise managing provider sessions beyond list/load/close.
- ACP mode switching (cursor advertises modes; ignored, as today).
- Cross-workspace session browsing or search; the list is the active workspace's, most-recent-first.
- Persisting recent-session lists (they are transient, like advertised commands).
- Composer commands beyond `/new` in this change.

## Decisions

### 1. Rollover creates a new provider session on the existing connection

`AcpSessionManager.rollover(id)` on a live record: guard (no active prompt — 409 "cancel the active prompt first"; not `auth_required`/`disconnected`/`exited` — 409), then best-effort `session/close` on the current `acpSessionId` only when `capabilities.canClose` (close errors are ignored; the context remains resumable in the provider store regardless), then `session/new` on the same adapter, reusing the existing session-response handling: new `acpSessionId`, config options from the response, `applyProviderPreferences`, resumability recomputation, status `live`, descriptor persisted with the new id.

The record keeps its local id, `rootPath`, provider, workbench slot, and process. `history` and the composer draft are cleared; a provider-derived title reverts to the provider label (`titleSource: "provider"`) while a user title is kept, so the existing title-ownership rule applies to the next provider title.

Alternative considered: kill and respawn the provider process for rollover. Rejected — churns the process, delays the fresh context, and breaks the "stop it, don't kill it" intent; multi-session-per-connection is verified working.

Alternative considered: reuse the same provider session and ask the provider to "clear context". Rejected — no portable ACP method exists for that, and providers would interpret it inconsistently; a fresh `session/new` is the protocol-native fresh context.

### 2. The composer distinguishes executing client commands from inserting provider commands

`/new` is a fixed client command rendered in the same slash list, visually marked (e.g., a "session" tag beside the name), filtered like provider commands, and selected with the same keys. On selection it does **not** insert text: it clears the draft and dispatches the rollover request; failures surface through the existing notice path and leave the draft/session untouched. Provider commands keep today's insert-and-stay-draft behavior.

Alternative considered: a separate command palette or a dedicated button. Rejected — the user's muscle memory is "type `/`", and the existing completion surface already owns key handling, dismissal, and IME behavior.

### 3. The picker's resume data comes from a transient lister process

`GET /api/acp/providers/:providerId/sessions` (active project only) runs `session/list` on a **short-lived provider process**: spawn with the provider command/args in the workspace cwd, `initialize`, `session/list`, kill — regardless of whether a live session of that provider exists. Results are filtered to entries whose `cwd` equals the active workspace root, sorted by `updatedAt` descending, bounded (~20), with titles and timestamps sanitized and length-bounded as untrusted display text. A per-`(providerId, cwd)` cache with a short TTL (~30 s) plus in-flight request deduping prevents respawning on repeated picker opens; a ~10 s timeout marks the provider's resume section as unavailable without blocking start-new entries.

The list route is only offered for providers whose `initialize` response advertises `sessionCapabilities.list` (new `canList` in `AcpSessionCapabilities`); providers that advertise it but return nothing render the muted "no resumable sessions" state.

Alternative considered: piggyback `session/list` on an existing live session's connection. Rejected — couples the picker to incidental sessions (a different session's process may be busy or about to exit), and the list is cwd-scoped to the workspace, not to any particular session.

Alternative considered: reading provider session stores from disk (e.g., opencode's DB). Rejected — provider-specific, violates the provider-owned boundary, and breaks for providers that keep no inspectable store.

### 4. Resuming is session creation with a load target

`POST /api/acp/sessions` gains an optional `acpSessionId`. `create()` with a load target follows the existing flow — record, spawn, `initialize`, auth handling — then calls `session/load(acpSessionId, cwd)` instead of `session/new`. The load response's config options replace the new-session handling (existing `applySessionResponse`), and the provider's transcript replay flows through the unchanged `handleSessionUpdate` pipeline into `history` and the browser, the same path restart-restore already uses. `resumability` is set from capabilities as today, and the descriptor persists the loaded `acpSessionId` so the next restart restore targets it.

Before spawning, `create()` checks live records for the same `(providerId, acpSessionId)` and returns the existing session (browser focuses it) instead of starting a second process. A load failure fails loudly: the record is disposed and the request returns an error; nothing is presented as restored.

Alternative considered: a dedicated resume endpoint separate from create. Rejected — it is the same lifecycle (spawn + connect + bind provider session + persist) with one different ACP call; one endpoint with an optional target keeps routes, auth, and project-scope checks in one place.

### 5. Rollover and resume reuse the event and persistence paths

Both operations end in the same places every other lifecycle change does: `publishStatus` (full session state, including `availableCommands`, `configOptions`, capabilities) and `persist(projectId)` (descriptors). No new wire event type, no new REST surface beyond the two routes, no snapshot changes.

## Risks / Trade-offs

- [Replay burst on resume/restore: a loaded session streams its whole past (144+ updates in the opencode probe)] → The pipeline already ingests these bursts during restart restore; history is capped (`maxHistoryItems`) and rendering is incremental. No change needed beyond testing a long session.
- [Capability flags over-promise (cursor advertises `list`, returns `[]`; neither implements `session/delete`)] → Trust runtime results: empty list renders a muted state, timeouts render unavailability, and only advertised methods are called.
- [Transient lister adds process startup cost to picker opens] → TTL cache + in-flight dedupe + 10 s cap; the picker's start-new entries never wait on the list.
- [Provider titles in the list are untrusted and potentially long] → Length-bound and trimmed at the server, rendered as text, never persisted.
- [Abandoning (not closing) the old context on providers without close support may leave provider-side state held until process exit] → Acceptable: the provider process is the session's own process and exits with it; closing is best-effort polish where advertised.
- [A session rolled over or resumed, then restarted, restores the *current* provider session id] → Correct by construction: descriptors always hold the id the user last had; earlier rolled-off contexts stay reachable only through the provider's own list, matching the spec's "not destroyed" semantics.

## Migration Plan

1. Add shared types: `AcpProviderSessionSummary` and the optional load target on the ACP create request; no wire migration.
2. Server: `canList` capability, transient lister + list route, `create()` load path with dedupe, `rollover()` + route; focused tests for list filtering/bounding/timeout, load dedupe and failure, rollover guards, close best-effort, and descriptor updates.
3. Web: composer client-command kind + `/new`, picker recent-sessions section (per provider, muted empty state, unavailable state), store actions for rollover and resume-create.
4. Verify end-to-end with an OpenCode session: prompt, `/new`, confirm the old context reappears in the picker and loads with its transcript; confirm restart restores the current context.
5. Rollback is a plain revert; no persisted-data migration (descriptors gain no new required fields).

## Open Questions

- Whether the picker should remember a last-resumed provider or session for a keyboard shortcut — deferrable; the spec only requires the picker flow.

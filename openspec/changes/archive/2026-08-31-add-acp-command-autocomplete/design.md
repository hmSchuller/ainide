## Context

See `proposal.md` for the motivation and user-visible scope. The ACP server adapter already receives `session/update` notifications and maps them into ainide-owned shared types. `AcpSession` is the existing browser-facing container for provider-scoped state, and status events plus project snapshots already deliver that state to reconnecting clients.

The current normalizer recognizes `available_commands_update` but converts it into retained history as an unknown activity. The ACP workbench has a controlled textarea composer, but no provider-command state or caret-aware completion surface. ACP commands are invoked as ordinary prompt text, so the provider remains responsible for interpreting the selected command and its arguments.

## Goals / Non-Goals

**Goals:**

- Preserve the provider's current complete command list as bounded, session-scoped metadata.
- Deliver command state through the existing authenticated ACP status and snapshot paths.
- Make slash-command discovery usable from the ACP composer with keyboard and pointer selection.
- Keep dynamic updates, reconnects, project isolation, and session-creation races predictable.
- Keep unsupported future ACP updates inspectable through the existing fallback.

**Non-Goals:**

- Scanning `.opencode`, `.cursor`, or other provider-specific skill directories.
- Classifying commands as built-ins versus skills when ACP does not provide that distinction.
- Adding a server command-execution endpoint or parsing provider command arguments.
- Persisting command descriptions, input hints, or other provider protocol metadata to disk.
- Adding autocomplete to PTY sessions or the global ainide command palette.

## Decisions

### 1. Model commands as current ACP session state

Add a shared browser-facing command shape containing the provider command name, description, and optional unstructured-input hint. Store the current list on the ACP session rather than as an `AcpActivity`. A command update is a complete replacement, so an empty provider list clears the previous state.

This keeps transcript history limited to conversational and operational activity, prevents the misleading `Unknown provider activity` entry, and lets normal status events and snapshots carry the state without adding another wire-event variant. The server normalizer will accept only the stable v1 command fields, trim and bound their text, omit malformed optional input data, and avoid forwarding raw provider metadata.

Alternative considered: retain the raw update as an activity and derive suggestions in the browser. Rejected because command availability is state, not history, and deriving from raw protocol payload would couple the browser to ACP SDK details and preserve stale or duplicate lists.

### 2. Reuse status events and make creation reconciliation idempotent

When a command update arrives, the ACP manager will replace the record's command list and publish the existing full session status event. The list will therefore be available in live updates, project-scoped snapshots, and reconnect replay without a new REST endpoint or event type.

Provider notifications can arrive around the `session/new` response. The browser's HTTP creation result must be merged by local session ID without duplicating an already observed session or overwriting newer command state received over the WebSocket. This makes a command update safe whether it arrives before or after the create response.

Alternative considered: add a separate command event and leave session creation behavior unchanged. Rejected because it duplicates session-state transport and still requires special handling when the command event races the initial HTTP result.

### 3. Treat provider commands and skills uniformly

The UI will label the surface as provider commands and display each advertised name and description. OpenCode skills that it exposes through ACP will naturally appear alongside built-in commands. ainide will add the leading slash only when inserting text; provider command names remain unchanged in state.

ACP does not define a portable built-in-versus-skill category, and provider-specific filesystem discovery could disagree with the active session's permissions or dynamic context. The provider's advertised list is the sole authority.

### 4. Use caret-aware slash completion in the ACP composer

The composer will activate completion when the caret is in a slash-command token that starts at the beginning of the draft or after whitespace. A bare `/` shows the session's complete current list; additional command-name characters apply a case-insensitive prefix filter. Completion closes once the command token has been followed by whitespace or when there are no matches.

Suggestions will show the command name, description, and input hint when present. Arrow keys move the active suggestion, Enter or Tab selects it while completion is open, Escape dismisses it, and pointer selection is supported. Selection replaces only the current slash token with `/<name> `, preserves text on both sides, restores focus, and never submits the prompt. The existing explicit send action and Cmd/Ctrl+Enter behavior remain unchanged.

Alternative considered: use a browser `datalist` or a global command palette. Rejected because the list is session-specific, suggestions need descriptions and hints, and insertion must preserve a controlled textarea caret and draft state.

### 5. Keep command state transient

Commands will exist in the live ACP manager and browser session state but will not be added to ACP descriptors or `sessions.json`. A browser reconnect during the same server lifetime receives the current in-memory list through the project snapshot. After a server restart, the list is empty until the provider advertises it again during session creation, loading, or resuming.

Persisting commands was rejected because descriptions and availability are provider-owned and dynamic, while the existing persistence boundary intentionally excludes live protocol state and transcripts.

## Risks / Trade-offs

- [Provider sends very long descriptions or many commands] -> Bound normalized command fields and list size on the server, and truncate visual descriptions in the suggestion list without changing the inserted command text.
- [Command availability changes while completion is open] -> Replace the list atomically, recompute matches, clamp the active index, and never rewrite the user's draft.
- [Command update races the session creation response] -> Upsert sessions by local ID and preserve command state already received from sequenced ACP events.
- [A provider advertises unusual command names] -> Render names as text and insert them as prompt text; ainide never executes or interprets the command name.
- [A resumed provider does not re-advertise commands] -> Do not restore stale commands from disk; show no suggestions until a fresh update arrives.
- [A hidden project receives provider updates] -> Keep command state attached to the session and deliver it only through the existing project-scoped event and snapshot routing.

## Migration Plan

1. Extend the shared ACP session model and server normalizer with transient command state.
2. Publish command state through existing status events and include focused tests for startup, replacement, clearing, unknown updates, project isolation, and reconnect snapshots.
3. Add the ACP composer completion surface and tests for filtering, keyboard and pointer selection, caret insertion, and no automatic submission.
4. Verify an OpenCode session surfaces its advertised commands and skills without an unknown-activity history item, while providers that send no command update continue to work unchanged.
5. Rollback requires only reverting the application build. No persisted data migration is required; the old behavior would display the notification as unknown history again.

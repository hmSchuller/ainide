## Context

See `proposal.md` for the motivation and user-visible scope. The current web flow asks for a title, fetches configured ACP providers, and then asks the user to type a provider ID or the special `pty` value. The provider endpoint already returns safe `{ id, label }` descriptors, while the ACP session creation endpoint currently requires a title.

ACP `session/new` returns a session ID and optional configuration, not a title. ACP providers can later send `session_info_update` with a human-readable title. ainide already owns the live ACP session record, the authenticated status-event stream, the browser session store, and the persisted ACP descriptor, so title ownership must be represented across all of those boundaries.

## Goals / Non-Goals

**Goals:**

- Make configured ACP providers the sole source for the new-agent picker.
- Launch a selected provider without an intermediate confirmation or title prompt.
- Show a useful title before an asynchronous provider title is available.
- Preserve provider title updates until the user explicitly renames a session.
- Make an explicit user rename authoritative across live updates, reconnects, and restarts.
- Keep provider commands, authentication, configuration, project isolation, and existing session lifecycle behavior unchanged.

**Non-Goals:**

- Adding a PTY entry to the ACP provider picker or changing PTY creation elsewhere.
- Asking the provider to generate a title through a synthetic prompt or provider-specific API.
- Inferring titles from provider IDs, model names, workspace names, or conversation content in ainide.
- Allowing the browser to see provider commands, arguments, environment values, or other configuration secrets while loading the picker.
- Removing the existing post-creation rename action.

## Decisions

### 1. Use the existing configured-provider endpoint as the picker source

The web client will load `AcpProviderDescriptor` values from `/api/acp/providers` when the new-agent picker opens, or use an equivalent cached request whose contents are refreshed when necessary. Each picker item will display the configured provider label and retain the provider ID only for the authenticated create request. No free-form provider input and no PTY option will be rendered.

Selection is the start action. The picker will mark the selected item as busy, issue the ACP session creation request, focus the returned session, and prevent duplicate clicks while that request is pending. A request failure will leave existing sessions unchanged and keep enough picker state to retry. An empty successful response will render a configuration-needed state rather than invoking `newTerminal`.

Alternative considered: keep the native prompts and validate the typed provider ID. Rejected because it preserves the avoidable title step, makes configured labels undiscoverable, and allows an invalid provider input path that the picker does not need.

### 2. Keep a server-owned provisional title

The create request will accept an omitted title. After validating the selected provider, the server will initialize the local session title from that provider's configured label. This value is only a fallback; it is not presented as a user-authored title. The ACP session remains immediately creatable because the protocol does not return a title synchronously and a provider may not send one until after the first prompt.

The server owns the fallback rather than the browser so every client sees the same initial state, provider labels remain validated configuration data, and title persistence does not depend on a browser-generated naming convention. The session public shape continues to expose a non-empty title for existing navigator and persistence consumers.

Alternative considered: wait for a provider title before completing creation. Rejected because title updates are asynchronous and optional, which would make a provider that never advertises a title impossible to start. Alternative considered: have the browser send the provider label as a hidden title. Rejected because it makes a client detail responsible for server metadata and obscures the distinction between a fallback and a user title.

### 3. Model title authority explicitly

Each live ACP record and persisted ACP descriptor will carry title provenance with two states: `provider` and `user`. New sessions start as `provider`. A valid non-empty `session_info_update.title` replaces the current title only while provenance is `provider`; the manager then publishes a normal sequenced session status event and persists the updated descriptor. Empty, null, malformed, or invalid title values are ignored, leaving the current usable title intact.

The rename operation sets the title and provenance to `user` in one server-side transition, publishes the updated session, and persists it. Later provider title updates are ignored for that record. Existing persisted descriptors created before provenance existed will be interpreted as user-owned, because their titles were historically entered explicitly by the user. This protects old named sessions during a restart and avoids a silent behavior change.

Alternative considered: compare the incoming provider title with the current title to infer whether the user renamed it. Rejected because a provider can legitimately emit the same or a changed title, and the comparison cannot distinguish a provisional label from a historical user title. Alternative considered: keep the override only in browser memory. Rejected because the server owns restoration and may have to enforce the rule after browser reconnects or for another local client.

### 4. Reconcile provider updates and the create response by session ID

Provider status events can arrive before or after the HTTP create response. The browser will merge the response into the existing ACP session list by local session ID instead of blindly appending it. If a status event has already delivered a generated title or another newer session field, the create response will not overwrite that state or create a duplicate navigator entry.

The server will publish title changes through the existing project-scoped ACP event path. Sequence handling remains the authority for ordered updates, and project checks continue to prevent a title update from appearing in another project's workbench. This avoids a new endpoint or event type while preserving reconnect snapshots.

Alternative considered: add a separate title event. Rejected because title is session state, not conversation activity, and a second event type would duplicate existing snapshot and sequencing behavior. Alternative considered: always replace the browser record with the HTTP response. Rejected because asynchronous provider metadata can already be newer than that response.

### 5. Keep persistence limited to title metadata

The persisted ACP descriptor will add only the title-provenance value needed to enforce rename precedence. Provider title text remains ordinary display metadata; commands, live protocol data, authentication material, environment values, and transcripts remain outside persistence. Restoration will retain the stored title and authority state, then allow provider-generated updates only for sessions whose stored provenance is `provider`.

No migration file is required. The descriptor parser will accept older records without provenance and apply the legacy user-owned interpretation. New descriptors will serialize the explicit value, and invalid provenance will be rejected or treated as the safe user-owned legacy case rather than granting provider overwrite authority.

## Risks / Trade-offs

- [A provider never sends a title] -> Keep the configured provider label as a stable, usable fallback and retain the existing rename action.
- [A provider sends a title before the create response reaches the browser] -> Upsert sessions by local ID and preserve event-delivered fields over stale creation data.
- [A provider sends a title after the user renames a session] -> Enforce title provenance in the server record, not only in React state.
- [Existing persisted sessions lack provenance] -> Treat missing provenance as user-owned so historically explicit names cannot be overwritten.
- [The provider list is unavailable when the picker opens] -> Show a retryable picker error and do not create a PTY or speculative ACP session.
- [The provider list is empty] -> Show a clear configuration-needed state and leave existing agents untouched.
- [A configured provider command fails after selection] -> Keep the picker retryable, surface the existing startup error, and do not mutate the existing session list.
- [A provider sends malformed title metadata] -> Normalize only bounded non-empty strings and retain the current title for all other values.

## Migration Plan

1. Extend shared ACP session and descriptor metadata with title provenance and make the create title optional at the authenticated API boundary.
2. Update the server's ACP creation, title-update, rename, snapshot, and restoration paths to apply the provider/user authority state.
3. Replace the web title/provider prompts with the provider picker and ID-based create-response reconciliation.
4. Verify old descriptors restore with user-owned titles, while new provider-owned sessions accept provider title updates.
5. Rollback is a coordinated application rollback. The new descriptor field is additive, and older binaries can ignore or reject it according to existing snapshot parsing behavior; no secret or protocol-stream migration is required.

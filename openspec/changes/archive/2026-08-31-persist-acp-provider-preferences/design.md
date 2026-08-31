## Context

See `proposal.md` for the motivation and user-facing scope. The ACP session manager currently receives configuration options from each provider `session/new`, keeps them on the live session, and sends later changes through `session/set_config_option`. The existing `sessions.json` format stores project UI state and sanitized ACP session descriptors, while `SessionSnapshot` is already the server’s local restart boundary.

The preference is global to a configured provider ID, not to a project or conversation. Existing ACP session restoration must remain provider-session-driven: loading or resuming an old conversation must not be changed by the preference used for future sessions.

## Goals / Non-Goals

**Goals:**

- Make accepted ACP option choices available after a server restart.
- Apply compatible preferences to new sessions while preserving session isolation.
- Keep persistence server-owned and compatible with the existing local snapshot lifecycle.
- Make malformed, stale, or rejected preferences harmless.
- Keep persisted data limited to bounded primitive option values.

**Non-Goals:**

- Persisting complete ACP option metadata, transcripts, auth state, provider environments, or session identifiers as preferences.
- Changing the ACP REST or WebSocket protocol exposed to the browser.
- Applying new-session preferences to restored conversations or copying them between providers.
- Adding a provider-specific settings editor or a second preferences file.

## Decisions

### 1. Store preferences at the top level of `sessions.json`

Extend the shared `SessionSnapshot` with an optional provider-preference collection. Each entry identifies one `providerId` and contains option IDs mapped to primitive string or boolean values. The field is top-level rather than inside `ProjectSessionSnapshot` because the preference is shared across projects and should be stored once.

The existing snapshot loader and sanitizer will parse this field strictly, discard malformed entries, and retain only bounded provider IDs, option IDs, and primitive values. The serializer will continue to exclude credentials, provider environments, process data, transcripts, and other protocol payloads. The optional additive field keeps existing snapshots valid and lets older ainide versions ignore the new data, consistent with the existing ACP snapshot extension.

A separate preferences file was rejected because it would split two pieces of local state that are saved together today, complicate restart and shutdown flushing, and create an additional migration path. Writing preferences into `config.json` was rejected because that file represents user-authored provider definitions rather than runtime state.

### 2. Keep preferences in the server-owned ACP manager

On startup, the server seeds the ACP session manager from the parsed snapshot. The manager maintains the in-memory provider-to-option map for the process lifetime. A successful explicit configuration change updates only the changed option’s remembered value and requests the existing debounced snapshot persistence. Provider-emitted option updates do not create preferences by themselves, and provider defaults are not recorded as user choices.

When a configuration change returns a canonical current value, the manager records that value when it is a valid primitive; otherwise it retains the accepted requested value. A failed configuration request does not alter the remembered value. A later session can therefore use the last successfully accepted choice without making a failed attempt sticky.

The server’s existing snapshot save path will include the manager’s current preferences in every full save. The existing debounced persistence path will be triggered after a successful option change, and shutdown will flush pending changes before closing ACP processes.

### 3. Apply preferences after `session/new`, sequentially and best-effort

ACP `session/new` does not receive arbitrary configuration values. After the provider returns its complete advertised option set and session ID, the manager will compare the remembered values for that provider with the current options and invoke `session/set_config_option` for compatible differences.

Applications will be sequential. Each response replaces the current option set before the next preference is considered, so provider-dependent options are revalidated against the latest advertisement. A preference is compatible only when its option ID is currently advertised, its primitive type matches, and a select value is one of the current choices. Values already equal to the provider’s current value do not cause a redundant request.

Missing options, invalid choices, provider rejections, or dynamic option changes are non-fatal. The new session remains usable with the provider-reported state, and the stale preference remains stored so it can become applicable again after a provider upgrade or configuration change. Preference application does not update other live sessions.

The same new-session initialization path will apply preferences after authentication creates a session. The restoration path will never apply them after `session/load` or `session/resume`; those calls remain the source of truth for an existing conversation.

Persisting complete option objects was rejected because labels and choice lists are provider-owned and become stale, while persisting provider defaults would unintentionally freeze future provider defaults. Passing preferences from the browser was rejected because the server already owns provider configuration and should remain the authority for restart behavior.

### 4. Use a conservative persistence boundary

Only values represented by the current ACP client model, namely strings from advertised select choices and booleans, are eligible. Free-form objects, arrays, numbers, and unbounded strings are not persisted. Provider and option identifiers are bounded and validated during snapshot parsing. Option identifiers or labels that clearly indicate credentials or secrets will not be remembered, even if a provider advertises them as selectable configuration.

This boundary does not attempt to inspect arbitrary string entropy or infer secrets from every provider value. ACP authentication and provider environment data remain outside the preference model and continue to be excluded from persistence.

## Risks / Trade-offs

- [A provider advertises a value that later becomes invalid] → Validate against the latest complete option set, skip the value without failing startup, and retain it for possible future reuse.
- [One option changes the available choices for another option] → Apply remembered values sequentially and revalidate after every provider response.
- [A provider reports a sensitive-looking selectable option] → Persist only supported primitive values and reject identifiers or labels matching the existing conservative secret vocabulary.
- [Several sessions for one provider change options close together] → Update the provider preference only after each request succeeds; the last successful update observed by the server wins.
- [An older ainide version rewrites `sessions.json`] → Keep the field optional and additive; loss of the unknown preference field on an old-version rewrite is acceptable and does not affect ACP conversation or PTY restoration.
- [The preference store becomes corrupted] → Parse entries independently, discard invalid preference data, and continue loading valid project snapshots and ACP descriptors.

## Migration Plan

1. Add the optional shared snapshot type and strict parser/sanitizer for provider preferences. Existing `sessions.json` files without the field remain unchanged.
2. Load the preference collection into the ACP manager during server startup and include it in the existing full and debounced snapshot saves.
3. Record successful explicit ACP option changes and apply compatible remembered values during new-session creation, including the post-authentication path but excluding restoration.
4. Add focused tests for snapshot round trips and filtering, provider isolation, restart reuse, invalid values, dynamic options, failed updates, and restored-session preservation.
5. To roll back, deploy the previous build. It ignores the additive preference field; existing ACP session descriptors and PTY metadata remain in their established shapes. A later old-version snapshot write may remove only the new preference field.

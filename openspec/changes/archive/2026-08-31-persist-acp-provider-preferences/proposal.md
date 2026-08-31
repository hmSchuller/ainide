## Why

ACP configuration choices currently disappear when ainide or its server restarts. Users who consistently prefer a particular model or provider option must repeat the same setup for every new agent, even though ainide already owns a local session snapshot for restart recovery.

## What Changes

- Persist the last successfully selected ACP configuration values per configured provider in the local session store.
- Load those provider preferences during server startup and apply compatible values to newly created ACP sessions.
- Keep existing ACP conversations and their provider-reported configuration unchanged when restoring resumable sessions.
- Treat missing, stale, incompatible, or rejected preference values as non-fatal and retain the provider’s current defaults.
- Persist only validated primitive configuration values; do not persist ACP transcripts, credentials, provider environments, or session protocol data.

## Capabilities

### New Capabilities

<!-- None. This change extends the existing ACP session capability. -->

### Modified Capabilities

- `acp-agent-sessions`: Persist provider-scoped configuration preferences and reuse them for new sessions across server restarts.

## Impact

- `packages/shared`: Extend the local session snapshot model with sanitized provider preference data.
- `apps/server`: Load and save preferences with `sessions.json`; remember successful option changes; apply compatible preferences after ACP session creation.
- `apps/server` tests: Cover persistence, provider isolation, restart reuse, stale values, and restored-session behavior.
- Existing ACP and PTY APIs remain compatible; no browser-supplied provider commands or secrets are added.

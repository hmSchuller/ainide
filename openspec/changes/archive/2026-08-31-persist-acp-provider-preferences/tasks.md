## 1. Snapshot Model And Validation

- [x] 1.1 Add the shared top-level provider-preference types and strict parsing for provider IDs, option IDs, and bounded string/boolean values; verify malformed entries, unsupported value types, and duplicate providers are rejected by focused parser tests.
- [x] 1.2 Extend session snapshot sanitization and serialization to round-trip provider preferences without changing existing project or ACP descriptor behavior; verify legacy snapshots still load and serialized output excludes credentials, environments, transcripts, process data, and protocol payloads.

## 2. ACP Preference Lifecycle

- [x] 2.1 Seed the ACP session manager from loaded preferences and remember only successful explicit configuration changes, using the provider-reported canonical value when valid; verify failed updates do not alter the remembered preference and changes remain isolated by provider.
- [x] 2.2 Apply compatible remembered values sequentially after new ACP sessions are created, including sessions created after authentication, while skipping stale or rejected values without failing the session; verify dynamic option updates and provider defaults with deterministic fake-provider tests.
- [x] 2.3 Keep restored ACP conversations governed by `session/load` or `session/resume` rather than new-session preferences; verify a restored session retains its provider-reported configuration while a later new session receives the remembered preference.

## 3. Server Persistence Integration

- [x] 3.1 Wire the ACP preference state into startup loading and the existing debounced, full-save, and shutdown snapshot paths; verify a preference written by one server instance is loaded and applied by a subsequent server instance using the existing local sessions-file override.
- [x] 3.2 Preserve the existing browser API and project snapshot boundaries so provider preferences never come from or return to the web client; verify ACP REST, WebSocket, PTY, and multi-project regression tests remain unchanged and pass.

## 4. Verification

- [x] 4.1 Run `npm run typecheck` and `npm test`; verify all server and web tests pass, including the new persistence, validation, restart, provider-isolation, stale-value, and restored-session coverage.

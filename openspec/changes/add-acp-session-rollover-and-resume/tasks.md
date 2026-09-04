# Tasks: ACP Session Rollover and Resume

## 1. Shared types

- [x] 1.1 Add `AcpProviderSessionSummary` (sessionId, title, updatedAt) and an optional `acpSessionId` load target to the ACP session-create request in `packages/shared/src/index.ts`, and verify `npm run typecheck` passes across all packages

## 2. Server: provider session listing

- [x] 2.1 Derive a `canList` capability from the agent's `sessionCapabilities.list` in `capabilitiesFor` and expose it on `AcpSession`, and verify a manager test maps a stubbed `initialize` response with and without the flag
- [x] 2.2 Implement `listProviderSessions(providerId, rootPath)` on the ACP manager using a transient provider process (spawn, initialize, `session/list`, kill) with workspace-cwd filtering, `updatedAt` descending order, a ~20 entry bound, and length-bounded sanitized titles, and verify a manager test with a stub provider excludes other-cwd entries, orders, bounds, and sanitizes titles
- [x] 2.3 Add `GET /api/acp/providers/:providerId/sessions` with session-token auth, active-project scope, a `canList` gate, a ~30 s per-provider/cwd TTL cache, in-flight dedupe, and a ~10 s timeout that reports resume unavailable, and verify server tests cover auth failure, workspace scoping, timeout degradation, and cache preventing a second spawn

## 3. Server: resume via session load

- [x] 3.1 Extend `AcpSessionManager.create` with an optional `acpSessionId` that calls `session/load` instead of `session/new`, applies the load response's config options, recomputes resumability, and persists the descriptor with the loaded id, and verify a manager test confirms the load call, replayed `session/update` history, and persisted `acpSessionId`
- [x] 3.2 Dedupe resume against live records: when a live session already binds the same `(providerId, acpSessionId)`, return that session without spawning, and verify a manager test shows no second provider process starts
- [x] 3.3 Fail load failures loudly: dispose the record and surface an explicit error without presenting the session as restored, and verify a manager test plus a server test for the error mapping
- [x] 3.4 Accept `acpSessionId` in the ACP create route and verify a server test for the request contract and project scoping

## 4. Server: rollover

- [x] 4.1 Implement `AcpSessionManager.rollover(id)`: reject an active prompt (409 "cancel the active prompt first") and non-live or auth-required sessions, best-effort `session/close` only when `canClose` (close failures ignored), `session/new` on the same adapter, clear history, revert provider-derived titles to the provider label while keeping user titles, re-apply remembered provider preferences, persist the descriptor with the new `acpSessionId`, and publish status, and verify manager tests cover close-called-when-advertised, close-skipped-otherwise, new provider session id, cleared history, and both title ownership cases
- [x] 4.2 Add `POST /api/acp/sessions/:id/new` with session-token auth returning the updated session, and verify server tests for auth, the active-prompt 409, and the returned state

## 5. Web: composer `/new` client command

- [x] 5.1 Extend the command-autocomplete module with a fixed, visually distinguished client command kind (`new`) sharing the existing token matching, filtering, and keyboard handling while selecting it executes instead of inserting, and verify unit tests for filtering alongside provider commands and non-insertion on selection
- [x] 5.2 Wire `/new` selection in the ACP composer to clear the draft, call the rollover route, update the session in place, and on failure show a notice while leaving draft and session unchanged (including the active-prompt guidance), and verify store/component tests for success, active-prompt failure, and generic failure paths

## 6. Web: picker recent-sessions section

- [x] 6.1 Add store state and an action to fetch a provider's recent sessions for the active project (loading, available, empty, unavailable results) using the new route, and verify store tests for each result state and project switching
- [x] 6.2 Add the recent-sessions section to the new-agent picker per provider (title plus recency, start-new entries unchanged, muted empty state, unavailable state), and verify a component test renders all four states
- [x] 6.3 Route recent-session selection through session creation with the `acpSessionId` load target and focus the returned session, including the dedupe case where the server returns an already-live session, and verify store tests confirm no duplicate workbench entry and correct focus

## 7. Integration verification

- [x] 7.1 Run `npm run typecheck`, `npm test`, and `npm run build` from the repository root and verify all pass
- [x] 7.2 Verify end-to-end with a live OpenCode session: prompt a session, run `/new` (same card, fresh context), confirm the previous conversation appears in the picker's recent sessions, select it and confirm the transcript replays, restart the server and confirm the current context restores

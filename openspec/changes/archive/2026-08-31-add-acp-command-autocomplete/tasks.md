## 1. Shared ACP Command State

- [x] 1.1 Add the browser-facing ACP command type and current command list to the shared session model, update session cloning and fixtures, and verify `npm run build -w @ainide/shared` succeeds
- [x] 1.2 Define bounded normalization for command names, descriptions, and stable v1 text-input hints, including malformed and oversized provider data, and verify focused normalization tests pass

## 2. Server Event Handling

- [x] 2.1 Handle `available_commands_update` as a complete replacement of live session command state, publish it through existing status events, and verify the update does not append an activity-history entry
- [x] 2.2 Preserve command state in project-scoped ACP snapshots and reconnect flows without adding it to persisted ACP descriptors, and verify server API/WebSocket tests cover active-project isolation and transient restart behavior
- [x] 2.3 Make ACP session creation reconciliation idempotent so a command status event racing the HTTP creation response cannot duplicate a session or overwrite newer command state, and verify a race-focused client-state test passes

## 3. ACP Composer Completion

- [x] 3.1 Add caret-aware slash-token matching and case-insensitive prefix filtering for the selected ACP session, and verify utility tests cover a bare slash, partial commands, whitespace boundaries, no matches, and empty command lists
- [x] 3.2 Render accessible provider-command suggestions with descriptions and optional input hints, support pointer selection plus ArrowUp/ArrowDown, Enter/Tab, and Escape behavior, and verify workbench interaction tests cover keyboard and pointer paths
- [x] 3.3 Insert the selected command as `/<name> ` at the caret while preserving surrounding draft text and focus, without submitting the prompt, and verify tests assert the existing prompt API is called only after explicit send
- [x] 3.4 Keep command suggestions scoped to ACP sessions and absent from PTY surfaces and the global ainide command palette, and verify mixed-session UI tests cover provider and project isolation

## 4. Integration Verification

- [x] 4.1 Extend the fake ACP provider coverage to advertise startup, replacement, and empty command updates while retaining the unknown-update fallback, and verify server and web test suites pass
- [x] 4.2 Run `npm run typecheck` and `npm test` from the repository root, then verify an installed OpenCode ACP session displays its advertised commands and skills without an unknown-activity transcript item

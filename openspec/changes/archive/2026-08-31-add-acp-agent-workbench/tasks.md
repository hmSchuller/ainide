## 1. Shared Types And Configuration

- [x] 1.1 Add the `acpAgents` configuration shape and parser in `apps/server/src/config.ts`, preserving `agentCommand` for PTY sessions; verify valid provider definitions load and malformed entries are ignored or rejected without exposing `command`, `args`, or `env` from provider APIs.
- [x] 1.2 Add shared ACP provider, session, configuration-option, permission, prompt-context, status, and normalized event types in `packages/shared/src/index.ts`; verify the shared package builds with `npm run build -w @ainide/shared`.
- [x] 1.3 Add `AcpSessionDescriptor` and the additive `acpSessions` project snapshot field, including strict parsing and secret-free sanitization while keeping legacy `agentSessions` PTY-only; verify `apps/server/src/sessions.test.ts` covers old snapshots, ACP descriptors, and excluded secrets.
- [x] 1.4 Document the local `acpAgents` configuration with Cursor `agent acp` and OpenCode `opencode acp` examples; verify the documented commands match the server's direct-spawn argument shape.

## 2. ACP Transport And Protocol Adapter

- [x] 2.1 Add the pinned server dependency on `@agentclientprotocol/sdk` and isolate its imports to a server-side ACP adapter; verify `npm install` and `npm run typecheck` succeed without adding ACP dependencies to `packages/shared` or `apps/web`.
- [x] 2.2 Implement an injectable stdio child-process transport that spawns configured commands with `shell: false`, forwards ACP JSON-RPC traffic, captures bounded stderr diagnostics, and reports process/stream failures; verify transport unit tests cover startup failure, malformed output, stderr, and exit handling.
- [x] 2.3 Implement `AcpProtocolAdapter` initialization, authentication dispatch, session creation/loading, cancellation, configuration selection, and capability negotiation; verify a fake ACP provider test confirms only advertised methods are called.
- [x] 2.4 Normalize ACP session updates and provider requests into AINIDE shared events, preserve unknown update metadata safely, assign per-session sequence numbers, coalesce streaming chunks, and bound large retained payloads; verify adapter tests preserve arrival order and keep unknown updates non-fatal.

## 3. ACP Session Manager

- [x] 3.1 Implement `AcpSessionManager` with one provider process per local session, stable ainide IDs, project ownership, status transitions, provider identity, and in-memory history; verify unit tests can start two sessions for one project without shared state.
- [x] 3.2 Implement configured-provider lookup and session startup through `initialize` and `session/new`, including connecting, live, auth-required, and startup-failed states; verify unavailable commands leave existing sessions unchanged and return an actionable error.
- [x] 3.3 Implement per-session model and other ACP configuration-option state and updates; verify selecting an advertised option affects only its session and absent model options do not produce a fallback catalog.
- [x] 3.4 Implement prompt submission, one-active-turn enforcement, cancellation, completion/failure/cancelled status, and structured event history; verify a second prompt is rejected while the first is active and cancellation reaches the provider.
- [x] 3.5 Implement pending permission and supported elicitation request tracking, browser response resolution, and cancellation/rejection of pending requests; verify no request is auto-approved and closing a session resolves all pending requests.
- [x] 3.6 Implement provider exit, invalid protocol, browser detachment, session close, project close, and server shutdown cleanup; verify one failed session does not stop unrelated sessions and all owned child processes are released.
- [x] 3.7 Implement restart restoration from `AcpSessionDescriptor`, including provider reinitialization, advertised load/resume checks, restored versus non-resumable status, and missing-provider handling; verify a non-resumable session is never presented as a newly created continuation.

## 4. Workspace And Terminal Bridges

- [x] 4.1 Implement ACP absolute-path validation and conversion through the session's fixed project root and `resolveSafePath`; verify traversal, absolute cross-project paths, symlink escapes, and invalid working directories are rejected before filesystem access.
- [x] 4.2 Implement ACP text file read/write callbacks through the owning project's `WorkspaceManager`, including atomic writes and active-project file/Git notifications; verify hidden project sessions can access their own workspace but not another project's files.
- [x] 4.3 Implement ACP terminal create/output/wait/kill/release callbacks with direct child processes, session ownership, validated cwd, and no shell expansion or generic HTTP command route; verify terminal lifecycle tests clean up resources on release, cancellation, provider exit, and shutdown.
- [x] 4.4 Verify ACP filesystem writes preserve the existing dirty-editor conflict behavior and never read browser buffers implicitly; verify an external write marks an unsaved editor tab as conflicted rather than overwriting it.

## 5. Server API, Persistence, And Events

- [x] 5.1 Extend server session bootstrap, project payloads, snapshot parsing, and persistence to expose ACP descriptors and restore ACP sessions without adding ACP entries to PTY `terminalKinds`; verify legacy sessions and project reopen behavior remain unchanged.
- [x] 5.2 Add authenticated ACP provider/session REST routes for listing, creation, prompt, cancel, config, auth, permission/elicitation response, rename, and close; verify malformed requests, unknown providers, missing sessions, and inactive-project targets return errors without crossing project boundaries.
- [x] 5.3 Add the authenticated `/acp-events` WebSocket with active-project subscription, initial session/history replay, live normalized events, sequence numbers, and reconnect behavior; verify unauthorized sockets close and hidden-project events are not delivered.
- [x] 5.4 Wire ACP manager lifecycle into `ProjectRegistry`, project switching/closing, server restoration, and `AinideServer.close`; verify switching modes or projects leaves live sessions running while closing the owning project cleans them up.
- [x] 5.5 Add server integration coverage using a deterministic fake ACP executable for startup, prompt streaming, permissions, path safety, reconnect replay, persistence, and cleanup; verify `npm run test -w @ainide/server` passes.

## 6. Web API And State Integration

- [x] 6.1 Add shared ACP API request/response types and client functions in `apps/web/src/api.ts`, including the `/acp-events` connection and explicit prompt reference payloads; verify token headers/query parameters are present on every ACP request and socket.
- [x] 6.2 Extend the Zustand store and project UI bag with ACP sessions, normalized per-session history, pending requests, prompt drafts, provider options, and transport-neutral focus/pin/reference target IDs; verify state tests preserve independent ACP/PTY selection and project filtering.
- [x] 6.3 Integrate ACP bootstrap, event replay, reconnect, project switching, and mode switching without changing the existing terminal WebSocket lifecycle; verify a browser reconnect attaches to existing sessions rather than creating duplicates.
- [x] 6.4 Add web-side reducers/helpers for ordered event application, message-chunk coalescing, unknown activity, status transitions, and bounded payload indicators; verify unit tests handle out-of-order/duplicate replay safely.

## 7. Unified Agent Workbench UI

- [x] 7.1 Extend `AgentWorkbench` and session navigation to combine ACP and PTY agent sessions while retaining names, provider/command identity, status, focus, pin, rename, close, and active-project filtering; verify two ACP sessions and mixed ACP/PTY sessions remain independently selectable.
- [x] 7.2 Add the ACP conversation surface with prompt composer, user/agent messages, plans, tool calls, file locations, diffs, terminal output, usage, completion, failure, cancellation, and unknown activity rendering; verify updates remain associated with the correct session and are safe text/markdown.
- [x] 7.3 Add provider/model/configuration controls driven only by session-advertised options and auth-required state actions; verify changing a model does not affect another session and no universal model list appears.
- [x] 7.4 Add accessible permission and elicitation dialogs with explicit approve/reject/cancel actions and pending-state feedback; verify the selected outcome is sent to the correct request and no request is approved by default.
- [x] 7.5 Add ACP file-location opening, diff inspection, and structured terminal activity links using existing editor, Git, review, and xterm surfaces; verify a provider-reported workspace path opens the correct file without bypassing existing project boundaries.
- [x] 7.6 Extend existing cockpit styles for ACP cards, status states, composer, dialogs, options, and responsive one/two-session layouts without adding a new visual design system; verify desktop and mobile layouts remain usable and existing PTY styling is unchanged.

## 8. Reference Handoff

- [x] 8.1 Extend reference targeting so live ACP sessions and PTY sessions are valid handoff targets while preserving the existing PTY insertion path; verify no-live-target behavior still leaves ordinary clipboard copying available.
- [x] 8.2 Implement per-ACP-session unsent prompt drafts containing reference content, workspace-relative path, and inclusive line provenance; verify adding a reference never calls `session/prompt` and targets only the selected ACP session.
- [x] 8.3 Serialize selected ACP references as explicit text content on prompt submission, using visible Monaco content for dirty buffers and leaving the reference kit transient; verify submission transmits context only once, does not save dirty files, and does not persist reference contents.
- [x] 8.4 Extend `apps/web/src/references.test.ts` and relevant workbench tests for ACP drafts, mixed targets, provenance, browser reload clearing, and explicit submission; verify existing PTY reference tests continue to pass.

## 9. Verification And Release Readiness

- [x] 9.1 Add focused security tests for session-token enforcement, provider allowlisting, secret redaction, path traversal, symlink escapes, cross-project actions, and direct terminal spawning; verify all focused server tests pass.
- [x] 9.2 Add web tests for session navigation, reconnect replay, model options, permissions, unknown updates, responsive two-session state, and dirty-buffer reference capture; verify all focused web tests pass.
- [x] 9.3 Run the complete repository checks `npm run typecheck`, `npm test`, and `npm run build`; verify no generated `dist`, `node_modules`, or `*.tsbuildinfo` files are added to the change.
- [ ] 9.4 Run optional local smoke tests with configured Cursor and OpenCode executables using `agent acp` and `opencode acp`; verify both providers can initialize, advertise their own options, receive a prompt, and leave existing PTY terminals usable.

## Context

See `proposal.md` for the motivation and user-facing scope. The current server has a
Fastify API, one broadcast `/events` WebSocket for workspace events, and a `/terminal`
WebSocket backed by `TerminalManager`. `TerminalManager` owns `node-pty` processes and
currently starts the single configured `agentCommand` for PTY agent sessions.

The `ProjectRegistry` keeps live project managers while inactive projects are paused,
and `WorkspaceManager` already provides the safe filesystem resolver and file-change
notifications. Session snapshots currently persist UI state and title-only PTY agent
descriptors in `sessions.json`. The web store and `AgentWorkbench` likewise assume that
every agent is a `TerminalSession`.

ACP changes the transport rather than replacing these facilities. A browser cannot
launch a local provider process, so the server must own the ACP child process, protocol
connection, provider callbacks, and project boundary. The existing session token,
loopback binding, safe path resolver, and dirty-buffer conflict behavior remain
constraints.

## Goals / Non-Goals

**Goals:**

- Add a typed, server-owned ACP transport alongside the existing PTY transport.
- Keep provider configuration, authentication, model options, and ACP capabilities
  scoped to individual local sessions.
- Deliver reconnectable, project-scoped structured events to the existing React client.
- Reuse existing workspace, Git, Monaco, reference-kit, and session lifecycle behavior.
- Make ACP filesystem and terminal callbacks auditable, bounded to the session workspace,
  and explicitly cleaned up.

**Non-Goals:**

- No browser-side process spawning or generic command-execution HTTP endpoint.
- No agent-to-agent orchestration, automatic task chaining, or hosted provider service.
- No provider-independent model catalog or migration of a conversation between providers.
- No synchronization of dirty editor buffers into an ACP filesystem callback.
- No persisted ACP transcript, authentication secret, provider environment, or reference
  kit contents.

## Decisions

### 1. Use one server-owned ACP connection per local session

Add an `AcpSessionManager` rather than teaching `TerminalManager` about ACP. Each live
ACP session owns:

- a stable ainide session ID and project ID;
- the configured provider ID and absolute workspace root;
- the child process and ACP connection;
- the provider ACP session ID, negotiated capabilities, auth state, and configuration
  options;
- normalized event history, pending permission or elicitation requests, and provider
  terminal children.

The manager starts the configured process with `node:child_process.spawn`, `shell: false`,
the session workspace as `cwd`, and fixed command/argument/environment values loaded
from server configuration. The browser sends only a provider ID and display title; it
cannot supply a command, arguments, or environment.

The additive configuration shape is an `acpAgents` list, for example:

```json
{
  "acpAgents": [
    { "id": "cursor", "label": "Cursor", "command": "agent", "args": ["acp"] },
    { "id": "opencode", "label": "OpenCode", "command": "opencode", "args": ["acp"] }
  ]
}
```

`agentCommand` remains the PTY-only setting. There is no automatic provider installation
or model discovery outside ACP configuration data.

Starting a session performs `initialize`, handles advertised authentication, and then
creates an ACP session with `session/new`. Restoring a persisted session repeats
initialization and authentication, then uses `session/load` or the provider's supported
resume method only when the provider advertised it. A provider process is not shared
between ainide sessions; this keeps callbacks, permissions, cleanup, and project
ownership unambiguous.

Reusing `TerminalManager` was rejected because ACP has bidirectional structured requests
and lifecycle semantics that do not map to terminal input/output. Sharing one ACP process
for several sessions was rejected because it complicates provider session isolation and
failure cleanup without a user-visible benefit in the first implementation.

### 2. Isolate the ACP SDK behind a server adapter

Use the official `@agentclientprotocol/sdk` as a server dependency for ACP protocol
types and client behavior. An `AcpProtocolAdapter` owns the SDK connection and the
stdio transport. It reads provider stdout as JSON-RPC ACP traffic, captures bounded
stderr diagnostics for status and startup errors, and translates process exit or invalid
protocol state into a session status without bringing down other sessions.

The SDK is not added to `packages/shared` or `apps/web`. Server code maps ACP messages to
AINIDE-owned shared types so the browser is not coupled to SDK version details. Known
session updates are normalized into ordered events for messages, tool calls, plans,
locations, diffs, terminal output, usage, completion, failure, and cancellation.
Unknown update variants are retained as sanitized metadata and rendered as an unknown
activity item; they do not terminate the connection or mark a prompt complete.

Each session assigns monotonically increasing event sequence numbers. Streaming message
chunks are coalesced into their current message in the in-memory history while live
events are still emitted immediately. Large tool and terminal payloads use explicit
bounded retention with a visible truncation marker, rather than allowing an ACP process
to exhaust server memory.

The adapter serializes ACP calls per session. Only one prompt turn is active at a time;
the API rejects a second prompt until the current turn completes or is cancelled. This
keeps cancellation, pending permissions, and event ordering deterministic.

Hand-rolling provider-specific protocol clients was rejected because it would duplicate
ACP negotiation and update semantics for Cursor, OpenCode, and future providers. Exposing
raw SDK objects to the browser was rejected because it would leak transport details and
make protocol upgrades a web-client concern.

### 3. Use REST for commands and a project-scoped ACP event WebSocket

Add authenticated endpoints with provider/session IDs validated by the server:

- `GET /api/acp/providers` returns configured provider IDs and labels only.
- `GET /api/acp/sessions` returns sessions for the active project.
- `POST /api/acp/sessions` starts a named session from a configured provider.
- `POST /api/acp/sessions/:id/prompt` submits text and explicitly supplied context.
- `POST /api/acp/sessions/:id/cancel` cancels the active turn.
- `POST /api/acp/sessions/:id/config` selects one advertised configuration option.
- `POST /api/acp/sessions/:id/auth` invokes an advertised provider authentication flow.
- `POST /api/acp/sessions/:id/requests/:requestId` resolves a pending permission or
  supported elicitation request.
- `DELETE /api/acp/sessions/:id` closes the session and its provider resources.

Long-running prompt and provider activity results arrive on a new authenticated
`/acp-events` WebSocket. The client subscribes to the active project only. On connection,
the server sends a session snapshot and retained event history, followed by live events;
sequence numbers let the client ignore duplicate replay data. On project switch, the web
client detaches from the old subscription and attaches to the new project's snapshot.
Hidden project sessions continue running but never appear on the active project's event
stream. Browser actions also require the target session to belong to the active project;
only server lifecycle code may operate on hidden sessions.

The existing token guard is extended to `/acp-events`, while `/events` and `/terminal`
remain unchanged. A separate channel was chosen over multiplexing ACP messages into
`/events` so workspace and agent protocols retain distinct shared types and reconnect
behavior.

### 4. Advertise only implemented ACP callbacks

During `initialize`, ainide advertises the stable ACP version and only the capabilities
implemented by the server adapter. The initial callback set is:

- text file read and write;
- provider terminal create, output, wait, kill, and release;
- permission and supported structured user-input callbacks.

Authentication is handled by the server using only methods the provider advertised. The
browser sees state, safe instructions, and any provider-approved non-secret login URL,
but never provider credentials, environment values, or raw auth tokens. Auth-required
sessions remain visible as waiting for authentication; if authentication cannot be
completed, the session reports the failure and does not send a prompt.

ACP configuration options are stored on the individual session exactly as advertised.
The UI renders model-category options and other provider options without inventing
fallback models. A configuration change calls the ACP configuration method with the
advertised option ID and value, then replaces the displayed option set when the provider
reports an update. Selecting another provider starts or selects another session and does
not copy history or unsent context.

### 5. Route filesystem and terminal callbacks through the project boundary

ACP filesystem requests use absolute paths, while AINIDE workspace APIs use relative
paths. The callback bridge first verifies that an ACP path is absolute and inside the
session's recorded root, converts it to a relative path, and then revalidates it with
`resolveSafePath`. Existing symlink and nearest-existing-ancestor checks therefore apply
to reads, writes, and new files. The bridge uses `ProjectRegistry.managerFor(projectId)`
instead of the active-project-only helper, so a hidden live project remains a valid owner.

ACP writes use the existing atomic workspace write path and continue to produce ordinary
file-change or Git refresh behavior when the project is active. A dirty Monaco buffer is
not sent to the ACP filesystem bridge and is never overwritten automatically; its visible
content is sent only when the user explicitly adds it to a prompt reference.

ACP terminal callbacks create direct child processes from the protocol's command and
argument fields without a shell or a new HTTP command endpoint. The requested working
directory is validated against the same root. Each terminal ID is owned by one ACP
session, and wait, kill, release, provider exit, prompt cancellation, session close,
project close, and server shutdown all remove its process and listeners. Invalid lifecycle
operations and path escapes return ACP errors without executing anything.

### 6. Keep ACP persistence separate from legacy PTY descriptors

Add an optional `acpSessions` field to `ProjectSessionSnapshot` rather than changing the
existing title-only `agentSessions` field. The new descriptor contains only the local
session ID, title, provider ID, provider ACP session ID, and resumability state. The
existing `agentSessions` field continues to describe PTY agents, and ACP sessions do not
add `agent` to `terminalKinds`.

This separation is intentional. Existing ainide releases ignore unknown `acpSessions`
data, whereas changing a descriptor in `agentSessions` could make an older release
recreate an ACP record as a PTY. The session parser and sanitizer explicitly validate
and preserve the new field while excluding tokens, auth data, provider environment,
commands, process IDs, streams, transcripts, and reference contents.

Descriptors are written after an ACP provider session ID is available. An auth-pending
process without an ACP session ID is live-only and must be recreated explicitly after a
restart. On startup or project open, the server attempts provider restoration only for a
descriptor whose provider is configured and whose prior capabilities allow loading or
resuming. Otherwise it exposes a non-resumable or needs-new-session state and never labels
a new session as the old conversation.

Project switching leaves live ACP and PTY processes running. Closing a project closes
its live ACP sessions before the project manager is closed, while its sanitized known
project metadata remains available for the existing reopen behavior. Server shutdown
closes all ACP sessions before Fastify exits.

### 7. Extend the current workbench instead of creating a second navigation model

Add ACP session types to `packages/shared` and keep `TerminalSession` for PTY and utility
terminals. The web store gains ACP session descriptors and per-session normalized history;
the existing focused, pinned, and reference-target IDs become transport-neutral local
agent IDs. Project UI bags persist selection and layout only, not ACP history, prompt
draft content, or reference kits.

`AgentWorkbench` combines ACP sessions with PTY agent sessions in one navigator. The
selected surface branches by transport: existing `TerminalView` for PTY and a structured
conversation/activity view for ACP. Both surfaces share title, provider/command identity,
status, focus, pin, rename, close, project filtering, and two-session layout behavior.

The ACP surface uses semantic native controls and the existing cockpit CSS rather than
adding a new visual design system. Provider/model configuration uses constrained selects
or equivalent controls; permission and elicitation requests use an accessible dialog;
unknown activity is shown as a safe text card. Agent text is rendered as text or sanitized
markdown, never as unsanitized provider HTML.

Reference handoff keeps the current PTY insertion path. For ACP, a target session owns an
unsent browser-side prompt draft containing selected `ReferenceItem` values. On explicit
handoff, the draft receives text content blocks formatted with the existing path and
line-range provenance. On explicit submit, those blocks are sent as part of
`session/prompt`; no background synchronization or automatic newline/send occurs. The
existing capture functions continue to use visible Monaco content, including dirty
buffers, without saving it.

### 8. Test the boundary with a deterministic fake ACP provider

Add server unit coverage around the protocol adapter and manager using an injectable
child-process/stdio transport and a small fake ACP fixture. Tests cover negotiation,
auth states, dynamic options, ordered updates, unknown updates, permission resolution,
prompt cancellation, reconnect replay, provider exit, and cleanup. Path-resolver tests
cover absolute path conversion, traversal, symlink escapes, cross-project access, and
terminal working directories. Session tests verify legacy snapshots, `acpSessions`
sanitization, resumable restoration, and non-resumable reporting.

Web tests cover the combined PTY/ACP session selector, project filtering, focus/pin
behavior, model option rendering, permission actions, unknown activity, and explicit
reference draft submission. Existing PTY, workspace, reference, and project tests remain
the regression suite. Completion requires server and web typechecks, package tests, and a
production build without requiring Cursor or OpenCode credentials.

## Risks / Trade-offs

- [ACP SDK or provider protocol drift] -> Pin the server SDK, isolate it behind the adapter, and run protocol tests against a fake provider plus real local smoke tests when a provider is installed.
- [Provider auth or environment secrets leak through the browser or snapshot] -> Keep provider definitions and auth handling server-side, return only sanitized state, scrub diagnostics, and explicitly sanitize persisted descriptors.
- [Path traversal or symlink escape through an absolute ACP path] -> Convert and revalidate every request with `resolveSafePath`, use the session's fixed root, and reject before any filesystem or process operation.
- [ACP terminal or provider processes leak on disconnects] -> Track ownership in both session and terminal maps, use `finally` cleanup for every lifecycle path, and close all managers during project/server shutdown.
- [A provider floods event or terminal output] -> Coalesce stream chunks, bound retained large payloads, and show truncation metadata while keeping the session alive.
- [Browser reconnect duplicates history or actions] -> Replay a session snapshot with monotonic sequence numbers, deduplicate client events, and reject concurrent prompts per session.
- [Agent writes conflict with unsaved editor content] -> Treat disk as the ACP filesystem view, preserve the existing watcher conflict marker, and use visible dirty content only for explicit reference handoff.
- [Older builds misinterpret new persisted records] -> Store ACP records in the new `acpSessions` field and leave legacy PTY descriptors and `terminalKinds` unchanged.
- [Native provider commands differ across machines] -> Use explicit user configuration and direct spawning, report startup failures in the session, and never attempt installation or shell expansion.

## Migration Plan

1. Add the optional `acpAgents` configuration and shared ACP types without changing
   `agentCommand`, PTY behavior, or existing session snapshot fields.
2. Add the server adapter, manager, safe callbacks, API routes, `/acp-events`, and
   `acpSessions` parsing/persistence. Existing snapshots load unchanged and projects with
   no ACP configuration behave exactly as before.
3. Add the combined web workbench and reference-draft behavior. The ACP controls appear
   only when configured providers are available; PTY and utility terminal surfaces remain
   available regardless.
4. Verify with the fake-provider, security, lifecycle, web, typecheck, test, and build
   suites. Run local Cursor/OpenCode smoke tests only when their configured executables
   are present.
5. To roll back, stop ainide and restore the prior application build. Its parser ignores
   the additive `acpSessions` field and the unchanged PTY descriptors remain safe. Live
   ACP child processes end with the server; no ACP transcript or secret needs migration.

# AGENTS.md

## Project

ainide is a local-first, browser-based developer cockpit. PTY terminals and ACP-backed conversations are the AI interfaces; Monaco is the human editing surface; Git and Difit provide review. Agents remain local processes owned by the ainide server.

## Structure

- `apps/server`: Fastify HTTP/WebSocket server, safe filesystem APIs, chokidar events, Git status, PTY and ACP process/session lifecycle, and review lifecycle.
- `apps/web`: React/Vite UI with Zustand, Monaco Editor, xterm.js, explorer, terminals, ACP conversations, and review mode.
- `packages/shared`: Shared TypeScript protocol and domain types, including browser-facing ACP types.

## Agent Transports

- PTY agent sessions are real terminal processes started in the active workspace with the configured `agentCommand` (or `AGENT_COMMAND` override).
- ACP sessions are structured conversations started from configured `acpAgents`. The server launches each provider directly with its configured command and arguments over stdio; ainide does not install providers or proxy them through a shell.
- ACP authentication and model/configuration choices remain provider-owned and are exposed only through the negotiated session capabilities. See the [README configuration guide](README.md#configuration) for the local configuration shape and examples.

## ACP Boundaries

- Route ACP filesystem and terminal requests through the safe resolver and the session's selected workspace. Reject path escapes, cross-project requests, and invalid terminal operations without reading, writing, or executing the rejected request.
- Never auto-approve ACP permission requests. Return only an explicit user-selected outcome, and resolve pending requests as cancelled or rejected when the prompt or session is cancelled.
- Preserve session-token checks for ACP API and `/acp-events` traffic. Keep live ACP provider processes running when the browser disconnects or the user leaves Agents mode, and clean them up on explicit close, project close, provider exit, or ainide shutdown.
- Persist only ACP session descriptors needed for local identification, project/workspace association, display state, and provider resumability. Never persist authentication secrets, session tokens, provider environment secrets, or live protocol streams, and never present a non-resumable session as restored.

## Commands

Run from the repository root:

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The backend defaults to `127.0.0.1:43127`. The Vite frontend proxies API and WebSocket traffic to it; a `PORT` override is shared by both processes during development.

## Implementation Rules

- Keep the application local-first. Do not add cloud services, accounts, telemetry, or provider-specific AI APIs. The single bounded exception is the startup release check: at most once every six hours, cacheable under `~/.config/ainide/`, carrying no identifying data, and disabled by `AINIDE_NO_UPDATE_CHECK=1`.
- The terminal owns the server: `ainide` runs the built server in the foreground with no daemon, pidfile, or background process and does not auto-open a browser. `SIGINT`, `SIGTERM`, and `SIGHUP` (including terminal close) each perform the same graceful teardown — stop PTYs/ACP/review and persist the session snapshot. `ainide update` fast-forwards and rebuilds but never restarts a running server. Do not introduce a daemon, service, pidfile, or detached process.
- Use real PTYs through `node-pty`; do not simulate terminal output in the browser.
- Keep filesystem access relative to the selected workspace and route paths through the safe resolver.
- Do not add a generic command-execution HTTP endpoint. Commands belong in explicit PTY sessions or fixed server-side operations.
- Bind to `127.0.0.1` by default. Preserve session-token checks for API and WebSocket traffic.
- Prefer Git CLI output over parsing Git internals.
- Preserve terminal sessions when switching between Edit and Review modes.
- Treat external file changes as potentially conflicting with unsaved editor content. Never overwrite dirty buffers automatically.
- Keep UI chrome small and cockpit-oriented rather than recreating VS Code.
- Use shared types for HTTP and WebSocket protocol changes.

## Verification

Before completing a change, run the relevant tests and typechecks. Security-sensitive backend changes should include focused tests, especially for path traversal, symlink escapes, process cleanup, or protocol validation.

Do not commit generated `node_modules`, `dist`, or `*.tsbuildinfo` files.

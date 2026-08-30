# AGENTS.md

## Project

ainide is a local-first, browser-based developer cockpit. The terminal is the AI interface; Monaco is the human editing surface; Git and Difit provide review.

## Structure

- `apps/server`: Fastify HTTP/WebSocket server, safe filesystem APIs, chokidar events, Git status, PTYs, and review lifecycle.
- `apps/web`: React/Vite UI with Zustand, Monaco Editor, xterm.js, explorer, terminals, and review mode.
- `packages/shared`: Shared TypeScript protocol and domain types.

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

- Keep the application local-first. Do not add cloud services, accounts, telemetry, or provider-specific AI APIs.
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

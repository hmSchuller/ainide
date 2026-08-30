## 1. Shared Port Resolution

- [x] 1.1 Add the shared backend port constant and resolver with `43127` as the fallback and strict TCP-port validation; verify unset, invalid, boundary, and valid override cases with focused tests.
- [x] 1.2 Apply the shared resolver to backend startup while preserving the `127.0.0.1` default host; verify the server listens on `43127` by default and on a valid `PORT` override when started in isolation.

## 2. Development Proxy Alignment

- [x] 2.1 Update the Vite configuration to resolve the same backend port from `PORT` without changing Vite's own frontend port settings; verify the default target is `127.0.0.1:43127` and an override target follows the configured port.
- [x] 2.2 Verify `/api`, `/events`, and `/terminal` proxy targets continue to support HTTP and WebSocket traffic under both default and overridden backend ports, while Vite still selects its next available frontend port when needed.

## 3. Documentation and Validation

- [x] 3.1 Update `README.md` and `AGENTS.md` with the `43127` default, development URL/proxy behavior, and `PORT` override guidance; verify no user-facing documentation retains `3000` as the default.
- [x] 3.2 Run `npm run typecheck`, `npm test`, and `npm run build`; verify all checks pass without changing API paths, host defaults, or review-tool port allocation.

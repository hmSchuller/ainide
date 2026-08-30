## Context

The backend currently resolves `PORT` at process startup, while the Vite development proxy has an independent hardcoded target. Browser API and WebSocket clients use relative paths, and the production server serves the built frontend itself, so the port boundary is limited to backend startup, development proxy configuration, and documentation. See `proposal.md` for the motivation and `specs/backend-port-configuration/spec.md` for the behavior contract.

## Goals / Non-Goals

**Goals:**

- Establish `43127` as the single default backend port.
- Resolve a valid `PORT` override consistently for both the backend and the development proxy.
- Keep the backend bound to loopback by default.
- Preserve Vite's independent frontend-port selection and automatic fallback behavior.
- Make the resolution rules easy to test without starting a full application or external tool.

**Non-Goals:**

- Automatically finding a different backend port when `43127` is occupied.
- Coordinating multiple ainide instances.
- Changing the browser API or WebSocket paths, production hosting model, or Difit port allocation.

## Decisions

### Use a fixed uncommon default

Use `43127` as the fallback backend port. It is sufficiently outside the most common local development defaults while remaining a stable documented address. A fixed default is preferred over binding to port `0` because the concurrent server and Vite processes need to agree on the backend target before proxy requests begin.

An automatic fallback sequence was considered but rejected: Vite would need a reliable way to discover the backend's selected port, and silently selecting a different port would make the startup contract and documentation less predictable. Users can still provide an explicit `PORT` when the chosen default is occupied.

### Centralize port resolution

Expose a small, runtime-neutral port constant and resolver through the existing shared workspace package. The resolver will accept the environment value supplied by each process, use `43127` when it is unset or invalid, and accept only an integer TCP port in the range `1` through `65535`. Treating invalid values as the default prevents the server and proxy from interpreting the same environment differently; port `0` is not accepted because it would request an ephemeral listener that the proxy cannot know.

The backend will use this resolver for its listen options. The Vite configuration will read the local `PORT` value during configuration loading and use the same resolver only for proxy targets. It will not assign that value to Vite's own `server.port`, so frontend port auto-selection remains unchanged.

Duplicating the default literal in the server and Vite configuration was considered but rejected because a future default change could silently split the two processes again. Introducing a new configuration service or external dependency was also rejected as disproportionate for one local setting.

### Keep proxy paths unchanged

Retain `/api`, `/events`, and `/terminal` as the proxy entries, changing only their backend target. This preserves the existing browser and WebSocket clients and avoids exposing a backend URL or port in frontend runtime configuration.

## Risks / Trade-offs

- [Risk] `43127` can still be occupied by a local process. → Keep `PORT` as an explicit escape hatch and document that fixed ports cannot guarantee availability.
- [Risk] Existing bookmarks or scripts pointing at `127.0.0.1:3000` will not follow the new default. → Document the new URL and preserve `PORT=3000` as a compatibility override when that port is available.
- [Risk] The shared package must be available when the Vite configuration loads. → Preserve the existing root development order, which builds the shared package before starting server and web processes, and cover the resolver with focused tests.
- [Risk] Invalid environment values could otherwise make the backend and proxy disagree. → Apply one validation and fallback rule in the shared resolver and test unset, invalid, boundary, and valid override values.

## Migration Plan

No persisted data or protocol migration is required. Restart the development or production server to pick up the new default, then use the printed frontend URL in development or `http://127.0.0.1:43127` when the backend serves the built frontend. Existing deployments that require port `3000` can set `PORT=3000` during the transition.

To roll back, restore the previous default value in the shared resolver and proxy documentation; explicit `PORT` overrides and application routes remain unchanged.

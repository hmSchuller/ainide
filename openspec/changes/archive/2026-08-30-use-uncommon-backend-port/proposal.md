## Why

The backend's default port `3000` is a common development port and can already be occupied by another local tool. The development proxy also hardcodes that port, so choosing a different backend port through `PORT` currently leaves the browser connected to the wrong service.

## What Changes

- Change the default Fastify backend port from `3000` to the uncommon fixed port `43127`.
- Make the Vite development proxy target the same backend port configuration used by Fastify.
- Preserve the `PORT` override for users who need a different available port.
- Leave Vite's own frontend port selection unchanged, including its existing fallback to the next available port.
- Update user-facing port documentation and project development guidance.

## Capabilities

### New Capabilities

- `backend-port-configuration`: Defines the backend's uncommon default port and keeps development routing aligned with configurable backend ports.

### Modified Capabilities

None.

## Impact

- Affects backend startup in `apps/server/src/index.ts` and the Vite proxy in `apps/web/vite.config.ts`.
- Updates `README.md` and `AGENTS.md` references to the backend port.
- Does not change API paths, WebSocket paths, host binding defaults, review-tool port allocation, or external dependencies.

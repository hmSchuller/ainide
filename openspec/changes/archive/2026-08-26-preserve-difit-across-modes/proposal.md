## Why

Switching between Edit and Review mode currently feels like launching Difit from scratch every time: the client clears the review URL, always calls `POST /api/review/start`, and unmounts the review iframe. The server often keeps the Difit process alive across Edit mode, but the UI discards that work. Fast Edit ↔ Review toggling should be instant, similar to how terminal sessions are preserved.

## What Changes

- Enter Review mode with a **status-first** flow: query `GET /api/review/status` before starting Difit.
- Reuse the existing Difit session when it is already running for the selected scope and returns a loadable URL.
- Stop clearing the review URL when switching to Edit mode or re-entering Review mode.
- Keep the existing explicit **Restart review** action and `restart=true` start path for forcing a fresh Difit instance.
- Expose the active review scope in review status so the client can decide reuse vs. restart without guessing.
- Continue stopping Difit on project switch/close (unchanged).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `review-mode`: Add requirements for preserving Difit across Edit ↔ Review mode switches, status-first review entry, and scope-aware reuse.

## Impact

- `packages/shared`: extend `ReviewStatus` with optional `scope`.
- `apps/server/src/review.ts`: include `scope` in status responses from `ReviewManager`.
- `apps/web/src/api.ts`: add `getReviewStatus()` client helper.
- `apps/web/src/App.tsx`: refactor `switchToReview()` to status-first reuse; avoid clearing URL on mode switch.
- `apps/web/src/store.ts`: preserve review URL in project bags when stashing/restoring (only clear on project switch, which already stops Difit server-side).
- Tests: server unit tests for scope in status; web-side test or focused integration coverage for reuse path if feasible.

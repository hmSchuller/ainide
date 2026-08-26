## Why

Review mode intermittently shows an error instead of the Difit diff panel. The server launches Difit with incorrect CLI arguments for several scopes, blocks on an interactive untracked-files prompt when stdin is ignored, and returns a review URL before Difit is actually listening. Users cannot reliably review changes from the cockpit.

## What Changes

- Fix Difit CLI argument mapping for all review scopes (working tree, staged, last commit, branch vs main).
- Launch working-tree review non-interactively when untracked files are present.
- Wait for Difit readiness before returning a review URL to the client.
- Surface clear error messages when Difit fails to start or exits early.
- Add server-side tests covering scope argument construction and readiness behavior.

## Capabilities

### New Capabilities

- `review-mode`: Reliable Difit-backed review surface lifecycle, scope selection, and error reporting in Review mode.

### Modified Capabilities

<!-- No existing review-mode spec in main specs. -->

## Impact

- `apps/server/src/review.ts` — Difit spawn args, readiness wait, status updates.
- `apps/server/src/review.test.ts` — expanded coverage for scopes and startup.
- `apps/web/src/App.tsx` and `apps/web/src/components/ReviewSurface.tsx` — only if client changes are needed for error display or retry (minimal).
- No new external dependencies; continues to shell out to `difit` on PATH.

## 1. Shared protocol

- [x] 1.1 Add optional `scope` to `ReviewStatus` in `packages/shared` and verify `npm run typecheck` passes across workspaces

## 2. Server

- [x] 2.1 Include `scope` in `ReviewManager.getStatus()` and successful `start()` responses when a scope is known; verify `review.test.ts` asserts scope on running status
- [x] 2.2 Add or extend a test that `start()` without `restart` returns existing status (including `url` and `scope`) when already running for the same scope; verify `npm run test -w @ainide/server` passes

## 3. Web client API

- [x] 3.1 Add `getReviewStatus(token)` calling `GET /api/review/status` in `apps/web/src/api.ts` and verify TypeScript compiles with the extended `ReviewStatus`

## 4. Review mode entry flow

- [x] 4.1 Refactor `switchToReview()` in `App.tsx` to status-first reuse per `design.md` (no URL clear on Edit switch; loading only when starting); verify manually that Edit → Review → Edit → Review shows the iframe without a loading flash when Difit is still running
- [x] 4.2 Wire scope mismatch and `restart=true` paths to call `startReview` with restart; verify changing scope then entering Review starts a new session (different port or fresh load)
- [x] 4.3 Confirm `restoreProjectBag` still clears `url` on project switch; verify switching projects does not show a stale iframe URL from the previous project

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm test` from repo root and verify all pass
- [x] 5.2 Manual smoke: open Review, switch to Edit, edit a file, return to Review — Difit appears instantly; click Restart review — fresh diff loads

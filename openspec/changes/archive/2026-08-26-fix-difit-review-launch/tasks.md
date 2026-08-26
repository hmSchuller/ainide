## 1. Scope argument fixes

- [x] 1.1 Extract `buildDifitArgs(scope, port): string[]` returning correct positional args per scope and common flags (`--no-open`, `--host`, `--port`, `--include-untracked` for working-tree); verify with unit tests asserting argv for all four scopes
- [x] 1.2 Add pre-flight check for `branch-vs-main` that verifies `main` exists via git before spawn; verify test returns clear error when `main` is absent

## 2. Readiness and lifecycle

- [x] 2.1 Implement `waitForHttpReady(port, timeoutMs)` that polls `http://127.0.0.1:<port>/` until HTTP 200 or timeout; verify with a mocked/local test server
- [x] 2.2 Update `ReviewManager.start()` to await readiness before setting `status.url` and returning; on timeout or child exit during wait, set `running: false` with a clear `message` and no `url`; verify unit test covers timeout path
- [x] 2.3 Ensure `stop()` and child `exit` handler leave `status` consistent (no stale `url` when not running); verify existing + new tests pass

## 3. Tests and verification

- [x] 3.1 Expand `review.test.ts` for no-workspace, missing-difit (mock `isAvailable`), argv construction, and readiness failure paths; verify `npm run test -w @ainide/server` passes
- [x] 3.2 Run `npm run typecheck` from repo root and verify no type errors

## 4. Manual smoke test

- [x] 4.1 With `npm run dev`, open ainide on this repo, switch to Review mode on working-tree scope with untracked files present, and verify Difit loads in the iframe without hanging or connection refused
- [x] 4.2 Repeat for staged, last-commit, and branch-vs-main scopes and verify each loads or shows a clear error (not a broken iframe)

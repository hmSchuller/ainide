## Context

See `proposal.md` for motivation. Today `ReviewManager` in `apps/server/src/review.ts` spawns `difit` with incorrect arguments for three of four scopes, ignores stdin while Difit prompts for untracked files on working-tree review, and returns `{ url }` immediately after `spawn` without waiting for the HTTP server. The web client embeds that URL in an iframe via `ReviewSurface`.

Verified Difit CLI behavior (v22-era install):

| Scope | Current (broken) | Correct |
|-------|------------------|---------|
| working-tree | `.` | `.` or `working` + `--include-untracked` |
| staged | `--staged` (invalid flag) | `staged` (positional) |
| last-commit | `HEAD~1..HEAD` (invalid) | `HEAD~1` `HEAD` (two positionals) |
| branch-vs-main | `main...HEAD` (invalid) | `main` `HEAD` (two positionals) |

## Goals / Non-Goals

**Goals:**

- Map each `ReviewScope` to correct Difit positional arguments and flags.
- Avoid interactive prompts by passing `--include-untracked` for working-tree scope.
- Block `review.start()` until the assigned port accepts HTTP (or timeout with error).
- Propagate Difit early-exit and spawn errors into `ReviewStatus.message`.
- Add focused unit tests for argument construction and readiness logic.

**Non-Goals:**

- Proxying Difit through Vite (iframe continues to load `127.0.0.1:PORT` directly).
- Polling `/api/review/status` from the client or auto-reconnecting dead iframes.
- Supporting review scopes beyond the four already in the UI.
- Bundling or installing Difit; it remains an external PATH dependency.
- Changing whether `--include-untracked` runs `git add --intent-to-add` (accepted Difit behavior for non-interactive startup).

## Decisions

### 1. Fix scope → argv mapping in `reviewTarget`

Replace the single-string return with a function that returns `string[]` positional args:

```ts
working-tree  → ["."]           + flag --include-untracked
staged        → ["staged"]
last-commit   → ["HEAD~1", "HEAD"]
branch-vs-main → ["main", "HEAD"]
```

Common trailing flags on all invocations: `--no-open`, `--host`, `127.0.0.1`, `--port`, `<port>`.

**Alternative considered:** Use `working` instead of `.` — equivalent for Difit; keep `.` to minimize diff.

### 2. Wait for readiness via HTTP probe

After spawn, poll `http://127.0.0.1:<port>/` (or HEAD) until HTTP 200 or a timeout (~10s, 100ms interval). Only then set `status.url` and return from `start()`.

Parse stdout/stderr for the "server started" line as a secondary signal, but do not rely on it alone.

**Alternative considered:** `--background` JSON mode — hung in manual testing; rejected.

**Alternative considered:** Fixed `setTimeout(2000)` — flaky across machines; rejected.

### 3. Handle Difit early exit during readiness wait

If the child exits while polling, reject startup immediately with the exit code in `message`. Kill any orphaned child on timeout.

### 4. Pre-flight validation for branch-vs-main

Before spawn, run `git rev-parse --verify main` (or equivalent) in the workspace cwd. If missing, return a clear error without spawning Difit.

**Alternative considered:** Let Difit fail — produces opaque "Invalid target" messages; pre-flight is clearer.

### 5. Minimal client changes

If the server stops returning a URL on failure, the existing `ReviewSurface` empty state already shows `review.message`. Only adjust the client if `switchToReview` merges fields in a way that leaves a stale `url` after failure — ensure `url` is cleared when absent in the response (already done in `setReview({ loading: true, url: undefined, ... })`).

No iframe retry logic in this change.

### 6. Tests without spawning real Difit

Extract pure helpers:

- `reviewArgs(scope, port): string[]` — assert full argv per scope.
- `waitForPort(port, probe)` — mockable with a fake HTTP responder.

Integration test against real Difit is optional/manual; unit tests cover the regression vectors.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `--include-untracked` mutates git index via intent-to-add | Document in code comment; matches Difit non-interactive contract; user can reset if needed |
| `main` branch assumption fails on repos using `master` | Pre-flight error is explicit; future scope config out of scope |
| Readiness probe races with slow Difit on large repos | 10s timeout with clear message; user can retry |
| Stale iframe if Difit dies after start | Existing limitation; out of scope for this change |

## Migration Plan

No migration. Deploy server fix; users retry Review mode. No config or protocol changes.

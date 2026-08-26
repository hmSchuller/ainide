## Context

See `proposal.md` — Why. Today `ReviewManager` already short-circuits `start()` when Difit is running with the same scope (`review.ts` line 95), and Edit mode does not call `review.stop()`. The pain is client-side: `switchToReview()` clears `url`, always POSTs start, and unmounts `ReviewSurface` via conditional render. `GET /api/review/status` exists but is unused by the web client. Project bags intentionally strip `url` on restore because Difit is stopped server-side on project switch.

## Goals / Non-Goals

**Goals:**

- Instant Edit ↔ Review toggling when Difit is still alive.
- Status-first entry: query before start; start only when needed.
- Scope-aware reuse via `scope` on `ReviewStatus`.
- Preserve explicit restart and scope-change restart semantics.
- Keep project-switch stop behavior unchanged.

**Non-Goals:**

- Auto-refreshing Difit when files change while in Edit mode (stale diffs are acceptable; user can restart).
- Keeping the review iframe mounted while hidden (CSS hide) — reuse via cached URL is sufficient for v1.
- Proxying Difit through Vite or changing Difit CLI flags.

## Decisions

### 1. Extend `ReviewStatus` with optional `scope`

Add `scope?: ReviewScope` to the shared type. `ReviewManager.getStatus()` and successful `start()` responses include it when `this.scope` is set.

**Alternative:** Client-only scope tracking. Rejected — status endpoint is the source of truth when returning from Edit mode or after a page refresh within the same server process.

### 2. Status-first `switchToReview()` flow

```
Enter Review (restart=false)
  │
  ├─ setMode("review")          // do NOT clear url yet
  ├─ GET /api/review/status
  │
  ├─ if running && url && scope === selectedScope
  │     └─ setReview({ ...status, loading: false })   // reuse
  │
  └─ else
        ├─ setReview({ loading: true })   // clear url only when starting
        └─ POST /api/review/start
```

`restart=true` (palette "Restart review", scope change + enter, or Restart button) skips reuse and always POSTs with `restart: true`.

**Alternative:** Always POST start and rely on server short-circuit. Rejected — client still cleared URL causing iframe flash; status-first gives correct loading UX.

### 3. Do not clear review URL when switching to Edit

`setMode("edit")` changes mode only. The stored `review.url` remains in Zustand and project bags for the active project.

On project restore (`restoreProjectBag`), continue clearing `url` — Difit was stopped server-side on switch, so the cached URL would be stale.

### 4. Scope dropdown defers restart until Review entry or explicit restart

Changing scope via the dropdown updates `review.scope` in the store only (current behavior). Entering Review or clicking "Restart review" triggers start with the new scope. This avoids killing Difit on every dropdown change while still in Review.

When scope changes while Review is visible, optionally auto-restart in a follow-up; out of scope for v1.

### 5. Loading UX

- **Reuse path:** no loading spinner; keep existing iframe src.
- **Start path:** show loading only after deciding start is needed (not on every mode switch).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Stale diff after editing in Edit mode | Documented non-goal; "Restart review" remains one click |
| Difit exits silently while in Edit | Status check on re-entry falls back to start |
| Orphan Difit process while in Edit | Acceptable — same as today when user stays in Edit after Review; stopped on project switch |
| Scope mismatch between client and server | Compare `status.scope` to client `reviewScope` before reuse |

## Migration Plan

No migration. Ship as a client + minor API extension. No config changes. Rollback is reverting the web flow and optional `scope` field (backward compatible if clients ignore it).

## Open Questions

_None — Approach A scope is clear enough to implement._

## Context

See proposal.md for motivation. Current state: `AcpProviderPicker.tsx` `RecentSessions` maps all `state.sessions` inline per provider with no disclosure; `.acp-provider-picker` has `overflow:hidden` and no `max-height`, and `.acp-provider-list` has no scroll containment (`apps/web/src/styles.css:271-277`). The server already bounds each provider to `MAX_PROVIDER_SESSIONS = 20` (`apps/server/src/acp/manager.ts:99,952`), so this change is presentation-only. The picker CSS classes are shared with `ProjectAgentSettingsDialog`, and recents arrive async after open (`App.tsx:787-794`), so layout must tolerate late list growth.

## Goals / Non-Goals

**Goals:**

- Keep every provider's Start-new entry visible without scrolling in the default state.
- Bound the dialog to the viewport with a single inner scroll region covering overflow from many providers or expanded recents.
- Preserve existing resume semantics (select → start provider + load session) and existing loading / empty / unavailable copy.

**Non-Goals:**

- No title filter/search, no virtualization, no change to the server bound of 20.
- No persistence of expand state across picker opens.
- No change to session creation, resume, rollover, persistence, or project scoping.

## Decisions

- **Zero-preview button toggle over `<details>` or preview-N rows.** A button labeled `Recent sessions (N)` with `aria-expanded` gives an explicit count affordance, matches the user's Start-new-default flow, and avoids unscannable `Untitled provider session` previews. Alternative (preview 3 + Show-all) rejected per user call: filter/preview is overkill.
- **Outer scroll on `.acp-provider-list`, not inner-per-provider scroll.** One scroll region follows the existing `.command-list` / `.workspace-picker-card` pattern, avoids nested scroll traps, and covers both the multi-provider and expanded-single-provider overflow cases. Alternative (per-provider inner scroll) rejected as fiddly.
- **Local per-open expand state, independent per provider.** A small picker-local state map (`Record<providerId, boolean>`, default collapsed) resets on close. Alternative (persist in store / localStorage like `ainide:terminal-collapsed`) rejected: default is Start-new, so remembering expansion adds complexity for no core flow.
- **Viewport-bounded dialog following existing tokens.** Dialog `max-height` as a viewport-relative bound (e.g. `min(640px, calc(100vh - 48px))` tuned to the `24px` overlay padding and mobile breakpoints) with the list as `overflow:auto` and header/Cancel outside the scroll region. Keeps header + Cancel pinned without sticky positioning.
- **Toggle only for available + non-empty.** Loading / empty / unavailable keep today's muted one-liner and render no button, so the toggle never expands to nothing and tests keep covering those four states.

## Risks / Trade-offs

- [Shared `.acp-provider-picker` / `.acp-provider-list` classes also style `ProjectAgentSettingsDialog`] → Verify settings dialog visually; containment should help both, but padding/max-height tuning must not compress settings content.
- [Async recents arrival shifts layout after open] → Scroll containment absorbs growth; collapsed default means arrival changes toggle counts, not dialog height, in the common case.
- [Keyboard / screen-reader disclosure] → Use a real button with `aria-expanded` and `aria-controls`; keep existing `role="group"` + `aria-label="Recent <label> sessions"` grouping so the expanded list stays announced per provider.
- [Small screens] → Verify at 390px width and short heights; outer scroll + collapsed default should keep Start-new + Cancel reachable, but overlay padding may need a mobile tweak.
- [20-row expanded list is still long to scan] → Accepted: Start-new is the default path and expansion is explicit; no search is added by user decision.

## Migration Plan

Web-only change. Deploy client together with server as usual; no API, snapshot, or config migration. Rollback is a web-only revert to the always-expanded list (reintroducing the overflow, no data impact).

## Open Questions

None. Toggle wording (`Recent sessions (N)`) and exact max-height value are set during implementation within the spec constraints.

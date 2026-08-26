## Context

See `proposal.md`. Editor tabs already support activation, close via ×, dirty tracking via `content` vs `savedContent`, and external-change conflicts. Saves go through `writeFile` in `App.tsx`; Monaco `onChange` updates the store directly. Explorer Shift-click already targets the secondary pane and must not change meaning on tab headers.

## Goals / Non-Goals

**Goals:**

- Close editor tabs with Shift-click on the tab label.
- Auto-save every editable buffer after a 1s debounce with no settings UI.
- Flush pending saves before close so tab hygiene stays frictionless.
- Overwrite disk on auto-save and clear conflict state when save succeeds.
- Keep manual ⌘S behavior and notices unchanged.

**Non-Goals:**

- Auto-save settings, modes (`onFocusChange`, `onWindowChange`), or server config.
- Middle-click tab close or terminal tab gestures.
- Changing explorer Shift-click semantics.
- Persisting unsaved buffers in project session snapshots (existing behavior).

## Decisions

### Shift-click on the tab label only

Handle Shift-click on the tab activation button, not the draggable wrapper or × button. Normal click still activates; Shift-click runs the existing close path. This avoids fighting tab drag-and-drop and keeps explorer Shift-click semantics separate.

**Alternative considered:** Middle-click close (VS Code default). Rejected per product preference for Shift-click.

### Debounced auto-save helper

Introduce a small `createAutoSaver` module with `schedule`, `flush`, and `cancel` per file path. `schedule` resets a 1000ms timer on each edit; `flush` clears the timer and runs save immediately; `cancel` drops a pending timer after a confirmed discard.

The save callback reads the latest tab from the Zustand store at execution time so debounced writes always use current buffer content.

**Alternative considered:** Save inside `updateTab` in the store. Rejected to keep persistence side effects out of state reducers and to reuse flush/cancel at close time.

### Silent auto-save, noisy manual save

Auto-save calls the same `writeFile` path as manual save but skips success toasts. Failures stay silent during auto-save; the close confirm covers the user-visible failure path. Manual ⌘S keeps the existing notice.

### Overwrite on conflict

When auto-save succeeds, update `savedContent` and clear `conflict`. This matches the chosen product policy: continuing to edit implies keeping the buffer and pushing it to disk. External changes can still arrive via watchers after save.

### Flush before close

Make tab close async: `flush(path)` → re-read dirty state → confirm if still dirty → `cancel(path)` → `closeTab`. Applies to both × and Shift-click.

## Risks / Trade-offs

- **Risk:** Auto-save races with terminal/agent edits to the same file. → **Mitigation:** Existing watcher/conflict flow remains; overwrite policy is explicit in the spec.
- **Risk:** Frequent writes while typing large files. → **Mitigation:** 1s debounce limits API churn; same order of magnitude as VS Code default.
- **Risk:** User Shift-clicks while starting a drag. → **Mitigation:** Browsers suppress click after drag; no extra handling required initially.
- **Risk:** Implementation landed before artifacts. → **Mitigation:** Tasks document the shipped code; validate specs against implementation before archive.

## Migration Plan

Web-only change. No server migration. Ship in one release; rollback by reverting the web diff.

## Open Questions

None.

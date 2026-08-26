## Context

See `proposal.md`. The explorer keeps `expanded` (which folders are open) and `directories` (cached `/api/files` results per path) in the Zustand store. Root `""` is loaded on workspace open via `loadExplorerAndGit` in `App.tsx`. Nested paths are only fetched from `Explorer.tsx` on directory click when `!directories[path]`. Session restore (`reopenFromSnapshot`) and project-bag restore set `expanded` from `expandedPaths` without scheduling nested loads, so the tree renders open folders with `directories[path]` undefined and shows the permanent "Loading..." branch in `renderEntries`.

The backend `WorkspaceManager.list(relativePath)` already resolves nested paths safely; no API change is required.

## Goals / Non-Goals

**Goals:**

- Any expanded folder always transitions to loaded content, empty state, or error.
- Restore and project-switch paths behave the same as a fresh click-expand.
- Explorer refresh covers all expanded branches, not only paths already present in `directories`.

**Non-Goals:**

- Eagerly prefetch unexpanded folders.
- Persist `directories` cache to disk (session snapshots keep `expandedPaths` only).
- Change explorer click semantics for opening files (normal vs Shift-click) or editor panes.
- Server-side listing, ignore rules, or Git status on entries.

## Decisions

### 1. Centralize "load expanded if missing" in Explorer

Add a `useEffect` in `Explorer.tsx` that watches `expanded` (and workspace/token) and calls the existing `load(path)` for every path where `expanded[path]` is true and `directories[path]` is absent. Read latest `directories` via `useAppStore.getState()` inside the effect to avoid stale closures and duplicate effect dependencies.

**Alternative:** Load only from the click handler. Rejected — does not cover session restore or programmatic `expanded` updates.

**Alternative:** Load all expanded paths from `App.tsx` after `reopenFromSnapshot`. Rejected — splits explorer loading logic across two modules; the effect in Explorer stays co-located with render and `load`.

### 2. Click handler loads on open, not on every toggle

Before `toggleDirectory`, record `const opening = !expanded[entry.path]`. After toggle, call `load(entry.path)` when `opening` and the path is not already loading/loaded. This avoids relying on collapse-time side effects and matches user intent.

Keep the effect as the safety net for restore; the click path remains responsive for first expand.

### 3. Extend `refresh()` in App.tsx

Build the refresh path set as the union of `Object.keys(directories)` and expanded paths from store (`Object.entries(expanded).filter(([, open]) => open).map(([path]) => path)`). Reload each via existing `listFiles` + `setDirectory`. Deduplicate paths.

**Alternative:** Only refresh keys already in `directories`. Rejected — expanded-but-never-loaded paths stay broken after refresh.

### 4. No duplicate-load guard beyond existing `loading` flag

`load()` already sets `{ loading: true }` synchronously before the fetch. Parallel calls for the same path may race but converge on the same result; no new mutex unless testing shows flicker.

## Risks / Trade-offs

- **[Effect + click both trigger load]** → Acceptable; `load` is idempotent and sets loading state immediately.
- **[Large expanded trees on restore]** → N sequential/parallel `/api/files` calls for N open folders; local-only and typically small; no pagination in scope.
- **[Stale bag `directories` after external delete]** → Refresh and file-change handlers already reload root; expanded-path refresh improves consistency.

## Migration Plan

Web-only change. Deploy server + web together is not required. No data migration. Rollback is revert of the Explorer/App refresh edits.

## Open Questions

None — behavior is fully specified and the fix is localized to the web client.

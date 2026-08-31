## Context

The terminal panel stores `terminalCollapsed` and `terminalMaximized` as separate layout states and persists only the collapse preference in browser-local storage. See `proposal.md` for the user-visible motivation. The current collapse control clears maximized state after requesting collapse, while the maximize-state transition also forces the panel to be expanded when maximized state is cleared.

## Goals / Non-Goals

**Goals:**

- Preserve the invariant that a maximized panel is expanded.
- Allow clearing maximized state without changing the requested collapsed or expanded state.
- Ensure the collapse control produces the requested final state in both normal and maximized views.
- Verify state transitions and local-storage outcomes without involving the server or project snapshots.

**Non-Goals:**

- Changing terminal height, resize behavior, terminal session ownership, or mode visibility.
- Adding a new layout abstraction or a new persistence mechanism.
- Changing the meaning or storage key of the existing collapse preference.

## Decisions

### Preserve collapse state when unmaximizing

The maximize transition will be directional: entering maximized state forces `terminalCollapsed` to false and persists the expanded preference; leaving maximized state changes only `terminalMaximized`. This makes `terminalMaximized` imply expanded without making it control the panel's collapse state in both directions.

**Alternative:** Reorder the two existing control updates so collapse is written last. This fixes the immediate event ordering bug, but leaves `setTerminalMaximized(false)` with a surprising side effect and makes future callers vulnerable to the same issue. It is rejected.

### Clear maximized state only when needed by collapse

The collapse control will clear maximized state when the panel is currently maximized, then apply the requested collapsed state. A normal expanded panel will only receive the collapse transition. The existing maximize control remains responsible for entering and leaving maximized mode.

**Alternative:** Add a dedicated store action that atomically toggles the entire terminal panel state. This would make the transition explicit, but adds a new API for a localized interaction without solving a broader state-management need. It is rejected.

### Test the regression at the store boundary

Focused web tests will exercise the same ordered state transitions used by the controls: expand then collapse, maximize then collapse, and maximize then restore. Assertions will cover both in-memory state and the existing local-storage preference. No component-testing dependency is needed.

## Risks / Trade-offs

- [State updates are dispatched separately] -> Keep the final collapse request after any maximized-state cleanup and test the ordered sequence explicitly.
- [Users affected by the regression may already have an expanded stored preference] -> Do not migrate or reinterpret existing values; the next successful collapse writes the correct `true` value.
- [Terminal resize observers react to panel visibility changes] -> Leave the existing body mounting and xterm resize behavior unchanged; verify the existing web test suite remains green.

## Migration Plan

No data migration is required. Existing `ainide:terminal-collapsed` values remain valid, and the server-side project snapshot format is unchanged. Rollback would be a web-only revert, with the known collapse regression returning but no persisted data requiring cleanup.

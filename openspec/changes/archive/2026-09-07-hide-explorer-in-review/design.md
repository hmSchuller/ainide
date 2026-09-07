## Context

See `proposal.md` for the motivation and `specs/review-mode/spec.md` for the observable behavior. The current application renders `.explorer-wrap` and its separate `.explorer-splitter` for every primary mode. The explorer stores directory listings, expansion, selection, and width in the existing browser/project UI state, while the Review surface is rendered in the adjacent flex-growing main column.

## Goals / Non-Goals

**Goals:**

- Make the workbench layout mode-aware so Review can use the full horizontal surface.
- Hide both the explorer and the separate splitter, including when the mobile drawer was previously open.
- Keep explorer browsing data and layout preferences intact across mode changes.
- Avoid changes to Review process lifecycle, Difit rendering, Git APIs, server routes, or shared protocol types.

**Non-Goals:**

- Replacing Difit or building a native diff viewer.
- Changing Review scopes, comments, refresh behavior, or inspection-return navigation.
- Changing the utility terminal footer behavior in Review.
- Removing the explorer from Edit, Agents, or any other mode that currently displays it.

## Decisions

### Make workbench chrome mode-aware at the layout boundary

Add a Review-mode layout state/class at the workbench or app-shell boundary and use it to suppress the explorer wrapper and splitter together. Hiding both elements is necessary because the splitter is a sibling of the explorer wrapper and would otherwise leave a narrow unused strip.

The main column already has `flex: 1` and `min-width: 0`, so removing the explorer's layout occupancy allows the Review surface to expand without changing ReviewSurface itself. This keeps the behavior centralized rather than teaching Difit or each Review child about the surrounding shell.

**Alternative:** Add a Review-specific width or margin override to the Review surface. Rejected because the explorer and splitter would still occupy layout space and the solution would be coupled to the current DOM nesting.

### Preserve mounted explorer state while suppressing presentation

Keep the explorer's existing Zustand/project state and directory-refresh behavior intact while making its wrapper non-displayed in Review. The hidden state must not be focusable or interactive. Any transient explorer-only presentation, such as an open context menu or mobile drawer flag, should be dismissed on the transition into Review so it cannot reappear unexpectedly when the explorer returns.

**Alternative:** Unmount the Explorer component in Review. Rejected for the first slice because it needlessly interrupts directory loading/refresh effects and could make cached directory restoration behavior dependent on mode transitions. The explorer's durable browser/project state is already separate from its rendered presence.

### Close the mobile drawer as part of entering Review

The mobile explorer is controlled by an app-level drawer flag and can remain open when the mode changes. Entering Review must clear that presentation flag, while leaving the explorer's directory and selection state untouched. Desktop behavior should not depend on the mobile flag.

**Alternative:** Rely only on CSS to hide the wrapper. Rejected because the drawer flag would remain true and could cause the explorer to slide back over the UI after leaving Review.

### Preserve the existing review and project boundaries

The change is purely browser layout behavior. It does not stop or restart Difit, alter the active project, clear editor tabs, or change persisted project snapshots. Existing project switching and Review inspection-return state remain authoritative.

## Risks / Trade-offs

- [Risk] A mode transition could leave a transient explorer context menu or mobile drawer visible when the explorer returns. → [Mitigation] Dismiss transient presentation state on Review entry while preserving directory, selection, and width state.
- [Risk] Hiding only the explorer wrapper leaves the splitter occupying space. → [Mitigation] Treat the wrapper and splitter as one layout unit and test both are absent from the rendered workbench geometry.
- [Risk] The main column may retain a stale width or Monaco layout after the explorer disappears. → [Mitigation] Use the existing flex layout and verify Review's child surface receives a resize/re-layout when the available width changes.
- [Risk] Explorer state could accidentally be cleared during mode changes. → [Mitigation] Keep the existing project UI bag and explorer stores untouched; test round-trip restoration of width, expansion, listings, and selection.

## Migration Plan

No data migration or server rollout is required. The browser layout change can be enabled with the existing Review mode. Rollback consists of removing the Review-mode layout suppression and mobile-drawer transition handling; no workspace, Git, Difit, or persisted session data is affected.

## Context

The web app currently stores file buffers as one global `tabs` array and one global `activePath` in `apps/web/src/store.ts`. `apps/web/src/components/Editor.tsx` renders one tab strip, one Monaco instance, and one editor reference. `apps/web/src/App.tsx` also uses the global active path for opening files, terminal references, and keyboard saves.

The change is local to the web app. The server filesystem APIs, WebSocket events, terminal sessions, review protocol, and shared package do not need new concepts. Existing dirty-buffer and external-conflict handling must remain path-based and must not be bypassed when a tab changes panes.

## Goals / Non-Goals

**Goals:**

- Model one primary and one optional secondary editor pane with independent ordered tab lists.
- Keep file buffer, saved content, binary, error, and conflict data shared by path.
- Route explorer opens, editor focus, line navigation, and saves to the correct pane.
- Support tab reordering within a pane and atomic moves between panes without duplicate ownership.
- Preserve the layout and buffers while Edit and Review modes are switched.
- Keep two-pane editing usable on narrow screens without adding a dependency.

**Non-Goals:**

- Supporting more than two panes or nested pane layouts.
- Adding server or shared-protocol support.
- Persisting open tabs, pane membership, or split state across page reloads.
- Adding resizable pane ratios in this change; panes use an equal-width split.
- Changing the existing save, reload, conflict-resolution, or binary-file semantics.

## Decisions

### Shared documents with pane-local ownership

Keep one `EditorTab`-like record per path as the shared document registry. Add pane layout state with stable primary and secondary IDs:

```text
documents: EditorTab[]
panes:
  primary:   { tabPaths: string[], activePath?: string }
  secondary: { tabPaths: string[], activePath?: string }
secondaryOpen: boolean
focusedPaneId: "primary" | "secondary"
```

The existing global tab records remain the source of truth for content and saved content. Pane actions operate on paths and update the registry only when a document is opened, edited, closed, or reloaded. A path lookup across both pane lists prevents duplicate ownership. This is preferable to copying `EditorTab` records into each pane, which could allow the two copies of a dirty buffer to diverge.

### Explicit open targets

The explorer will pass the click modifier into the open-file action. A normal click targets the primary pane; Shift-click targets the secondary pane and opens it on demand. If the path is already owned by either pane, the action focuses that pane and activates its existing tab instead of moving or duplicating it.

Terminal file references will target the currently focused pane unless the referenced path is already owned by another pane, in which case the existing pane is focused. The pending line location will include its target pane so the correct Monaco instance performs the reveal after mounting.

### Pane component boundary

Refactor the single editor surface into a layout component that renders one pane component per open pane. Each pane component owns its tab-strip presentation, conflict compare toggle, toolbar actions, and Monaco instance, while store actions continue to update shared document records.

Each pane will register its Monaco editor reference by pane ID. Pane focus is updated by tab, toolbar, and editor focus events. Save and navigation commands use the focused pane's active path rather than a global active path. Monaco instances will be keyed by the active file path so changing tabs does not lose the file identity or shared buffer state.

### Drag-and-drop tab operations

Tab headers will expose drag state containing only the source pane ID and file path. Tab strips and editor surfaces act as drop targets. The store performs one validated operation for both cases:

- Same-pane drops remove the path and insert it at the calculated destination index.
- Cross-pane drops remove the path from the source list, insert it in the destination list, and activate it there.

The operation identifies tabs by path rather than stale array indexes, keeps the path in exactly one pane, and never writes or reloads file content. A dirty or conflicted tab therefore moves without prompting or losing state. The secondary pane remains open when its tab list becomes empty. An explicit close-split action will merge any remaining secondary paths into the primary list before removing the secondary pane, preserving all documents.

### Equal-width responsive layout

The editor region will become a horizontal flex layout only when the secondary pane is open. On wide screens both panes receive equal width. On narrow screens each pane receives the available viewport width and the editor region provides horizontal access to the second pane instead of compressing both panes into unusable columns. Monaco's automatic layout remains enabled so each instance recalculates after layout changes.

### Session-only layout state

Pane membership, tab order, focus, and split visibility remain in the in-memory Zustand store. Existing localStorage persistence covers explorer and terminal dimensions only; this change will not persist file paths or split state, avoiding a restored split populated with stale workspace paths.

## Risks / Trade-offs

- **Risk:** Two Monaco instances increase editor lifecycle and focus complexity. → **Mitigation:** Keep one ref per pane, use path-keyed models, and route all commands through the focused pane.
- **Risk:** A drag operation can calculate an incorrect insertion position after the source tab is removed. → **Mitigation:** Apply remove-and-insert atomically using the path identity and normalize the destination index after removal.
- **Risk:** Asynchronous file loading can finish after a tab has moved or been closed. → **Mitigation:** Update the shared document only by path and keep pane membership separate, so a late load cannot reactivate or reinsert a closed tab.
- **Risk:** Closing a non-empty secondary pane could discard visible tabs. → **Mitigation:** Merge secondary tab paths into the primary pane before removing the pane; never discard buffers as part of closing the split.
- **Risk:** Horizontal access on narrow screens may be less discoverable than a stacked layout. → **Mitigation:** Keep pane headers and tabs visible, provide an obvious split/close control, and verify the narrow viewport behavior during manual UI checks.

## Migration Plan

No persisted data or server protocol migration is required. Implement the store transition, then update file-opening and save call sites, refactor the editor surface into pane components, add drag/drop behavior, and finish with responsive styling and verification. If the change is rolled back, removing the pane layout state and rendering the existing single editor restores the current behavior; no workspace files or backend state need cleanup.

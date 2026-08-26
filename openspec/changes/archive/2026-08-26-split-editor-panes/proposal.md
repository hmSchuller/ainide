## Why

ainide currently provides only one active Monaco editor, which makes comparing or working across two files require repeated tab switching. A two-pane editor keeps related files visible while preserving ainide's compact, local-first cockpit workflow.

## What Changes

- Add support for up to two vertical editor panes in Edit mode.
- Open an unopened file in the primary pane with a normal explorer click.
- Open an unopened file in the secondary pane with Shift-click, creating the secondary pane when necessary.
- Give each pane its own ordered tab list and active tab.
- Allow tab headers to be dragged to reorder tabs within a pane or move a tab to the other pane.
- Ensure a file is owned by at most one pane at a time.
- Preserve dirty buffers, conflicts, and editor state when tabs move between panes.
- Keep the secondary pane available after its last tab is moved; closing the split remains explicit.

## Capabilities

### New Capabilities

- `editor-split-panes`: Two-pane editor layout, deterministic file opening, pane-local tabs, and drag-based tab organization.

### Modified Capabilities

<!-- No existing spec capabilities are present in this repository. -->

## Impact

- `apps/web` editor components, Zustand editor state, explorer click handling, keyboard save targeting, and editor layout styles.
- Monaco instances and refs must become pane-aware; file contents and dirty/conflict state remain shared by path.
- No backend endpoints, WebSocket messages, shared protocol types, or external dependencies are required.

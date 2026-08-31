## Why

The terminal footer expands correctly but cannot remain collapsed after it has been opened. The collapse action is immediately undone by the maximize-state cleanup, leaving the editor with an unexpectedly persistent terminal panel.

## What Changes

- Make the terminal panel collapse control reliably transition between expanded and collapsed states on repeated use.
- Preserve the existing browser-local collapse preference when clearing maximized state.
- Keep maximizing behavior unchanged: maximizing the panel must make it expanded.
- Add focused coverage for normal and maximized collapse/restore transitions and local preference persistence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `terminal-utility-panel`: Require repeated collapse/expand toggles to honor the user's requested state, including after maximizing or restoring the panel.

## Impact

- Web terminal panel controls and Zustand layout state transitions.
- Web unit tests covering terminal layout behavior.
- No server, protocol, filesystem, or dependency changes.

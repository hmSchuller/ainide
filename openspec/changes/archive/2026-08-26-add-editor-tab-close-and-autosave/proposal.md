## Why

Closing editor tabs currently requires aiming at a small × control, and unsaved buffers trigger discard prompts that interrupt fast tab hygiene. ainide should support quick tab closing and automatic persistence so editing feels as fluid as VS Code without adding settings chrome.

## What Changes

- Shift-click an editor tab label to close that file in the current pane, using the same close semantics as the × control.
- Enable automatic save after a short debounce on every content change; no user-facing toggle.
- Flush any pending auto-save before closing a tab so close is usually frictionless.
- Auto-save overwrites disk content and clears an active external-change conflict banner when it succeeds.
- Manual ⌘S save remains available and continues to show a success notice; auto-save stays silent.

## Capabilities

### New Capabilities

- `editor-auto-save`: Debounced automatic persistence of editor buffers, flush-on-close, and overwrite-on-conflict policy.

### Modified Capabilities

- `editor-split-panes`: Add Shift-click tab close on editor tab headers (editor panes only; explorer Shift-click semantics unchanged).

## Impact

- `apps/web/src/components/Editor.tsx`: tab click handling, close flow, content-change wiring.
- `apps/web/src/App.tsx`: debounced save scheduling and shared write path with manual save.
- `apps/web/src/auto-save.ts`: debounce/flush/cancel helper and unit tests.
- No backend API, shared protocol, or configuration surface changes.

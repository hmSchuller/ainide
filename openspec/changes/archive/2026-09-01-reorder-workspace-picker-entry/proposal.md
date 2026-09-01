## Why

The workspace picker currently presents directory browsing before manual path entry. Users
who already know a directory path must visually pass through the browse surface before reaching
the fastest way to open it. Make free-text entry the primary action while retaining browsing for
users who prefer clicking through directories.

## What Changes

- Move the directory path field to the top of the workspace-selection controls.
- Keep path suggestions attached to the free-text field and render them within that entry block.
- Place the `Open project` action directly below the free-text entry block.
- Move the current-directory display, Home and Parent controls, and child-directory list below
  the manual-entry block as the secondary click-based picker.
- Preserve existing path validation, autocomplete keyboard behavior, directory navigation,
  recent-project shortcuts, and project-opening semantics.
- Preserve responsive behavior so both manual entry and directory browsing remain usable on
  narrow screens.

## Capabilities

### New Capabilities

### Modified Capabilities

- `workspace-directory-picker`: Change the picker presentation order so manual path entry and
  opening are primary, with click-based directory navigation below them.

## Impact

- `apps/web`: Reorder the `WorkspacePicker` controls and adjust picker layout styling and
  rendering tests.
- `apps/server` and `packages/shared`: No API or protocol changes expected.
- Existing path, suggestion, recent-project, and project-open behavior remains unchanged.

## Purpose

Automatically persists editor buffer changes to disk so users rarely lose work or hit discard prompts when closing tabs, without adding editor settings UI.

## ADDED Requirements

### Requirement: Editor buffers auto-save after editing

The Edit surface SHALL automatically save a text file to disk after the user stops editing for a short debounce interval. Auto-save SHALL be enabled by default with no user-facing setting to disable it. Auto-save SHALL NOT apply to binary files or files that failed to open.

#### Scenario: Typing triggers a debounced save

- **WHEN** the user edits a text file in the editor and pauses typing for the debounce interval
- **THEN** the system writes the current buffer to disk and marks the tab as saved

#### Scenario: Auto-save is silent

- **WHEN** a buffer is saved automatically
- **THEN** the system does not show the same success notice used for manual save

#### Scenario: Manual save still works

- **WHEN** the user invokes the existing manual save command on a dirty tab
- **THEN** the file is written to disk and the system shows the existing success notice

### Requirement: Auto-save overwrites disk and clears conflicts

When auto-save succeeds, the system SHALL treat the buffer as saved and SHALL clear an active external-change conflict state for that tab.

#### Scenario: Auto-save during a conflict banner

- **WHEN** a tab shows an external-change conflict and the user continues editing until auto-save runs
- **THEN** the buffer is written to disk, the tab is marked saved, and the conflict banner is cleared

### Requirement: Pending auto-save flushes before tab close

Before closing an editor tab, the system SHALL flush any pending debounced auto-save for that file. If the buffer is still dirty after the flush because saving failed, the system SHALL prompt before discarding changes.

#### Scenario: Close after recent edits

- **WHEN** the user closes a tab within the debounce window after editing
- **THEN** the system saves the pending changes before removing the tab when the save succeeds

#### Scenario: Close when save fails

- **WHEN** the user closes a tab and the flush or save attempt fails
- **THEN** the system prompts before discarding unsaved changes

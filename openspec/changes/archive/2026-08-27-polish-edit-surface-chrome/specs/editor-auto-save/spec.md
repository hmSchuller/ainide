## MODIFIED Requirements

### Requirement: Editor buffers auto-save after editing

The Edit surface SHALL automatically save a text file to disk after the user stops editing for a short debounce interval. Auto-save SHALL be enabled by default with no user-facing setting to disable it. Auto-save SHALL NOT apply to binary files or files that failed to open. The editor toolbar SHALL NOT expose a visible Save button.

#### Scenario: Typing triggers a debounced save

- **WHEN** the user edits a text file in the editor and pauses typing for the debounce interval
- **THEN** the system writes the current buffer to disk and marks the tab as saved

#### Scenario: Auto-save is silent

- **WHEN** a buffer is saved automatically
- **THEN** the system does not show the same success notice used for manual save

#### Scenario: Manual save still works

- **WHEN** the user invokes the existing manual save command on a dirty tab through the keyboard shortcut or command palette
- **THEN** the file is written to disk and the system shows the existing success notice

#### Scenario: No visible Save button in the editor toolbar

- **WHEN** the user views the editor toolbar on a text file
- **THEN** no Save button is shown in the toolbar actions

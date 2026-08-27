## ADDED Requirements

### Requirement: Explorer rows expose a context menu

The workspace explorer SHALL open a context menu when the user right-clicks a file or folder row. The menu SHALL offer actions appropriate to the entry type and SHALL close when the user activates an action, clicks elsewhere, or presses Escape.

#### Scenario: Right-click a file

- **WHEN** the user right-clicks a file row
- **THEN** a context menu appears with file-oriented actions including open, open to the side, copy path, add to reference kit, rename, and delete

#### Scenario: Right-click a folder

- **WHEN** the user right-clicks a folder row
- **THEN** a context menu appears with folder-oriented actions including new file, new folder, copy path, rename, and delete

#### Scenario: Context menu does not steal left-click navigation

- **WHEN** the user left-clicks a row to open or expand it
- **THEN** the explorer behaves as before and does not require a context menu interaction

### Requirement: Explorer context actions integrate with file operations

Explorer context menu actions that mutate the workspace SHALL use the workspace file-operation APIs. Delete and rename actions SHALL confirm destructive operations and SHALL handle open editor tabs safely by flushing auto-save and prompting when a dirty tab would lose unsaved changes.

#### Scenario: Delete an open dirty file

- **WHEN** the user deletes a file that is open in the editor with unsaved edits and auto-save has not yet flushed
- **THEN** the system flushes pending auto-save or prompts before completing the delete

#### Scenario: Rename an open file

- **WHEN** the user renames a file that is open in an editor tab
- **THEN** the tab path updates to the new location and the buffer remains available

#### Scenario: Create from folder context menu

- **WHEN** the user chooses New file from a folder's context menu and supplies a name
- **THEN** the new file is created inside that folder and can be opened from the explorer

### Requirement: Explorer copy actions use the clipboard

Explorer context menu copy actions SHALL place workspace-relative paths or file text contents on the clipboard without mutating disk files.

#### Scenario: Copy file path

- **WHEN** the user chooses Copy path on a file row
- **THEN** the clipboard contains the workspace-relative path for that file

#### Scenario: Copy file contents

- **WHEN** the user chooses Copy contents on a readable text file
- **THEN** the clipboard contains the file's text content and the source file on disk is unchanged

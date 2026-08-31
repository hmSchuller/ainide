# workspace-explorer Specification

## Purpose

The workspace explorer shows the active project's directory tree and lets the user browse nested folders without leaving the cockpit.

## Requirements

### Requirement: Explorer loads nested directories on demand

The system SHALL fetch directory listings from the active workspace for every expanded folder in the explorer tree, not only the workspace root. A folder that is expanded SHALL show its child entries, an explicit empty-folder state, or an explicit error — not an indefinite loading placeholder.

#### Scenario: User expands a nested folder

- **WHEN** the user expands a directory that has not been listed yet
- **THEN** the explorer fetches that directory's children and renders them beneath the folder row

#### Scenario: Expanded folder has no children

- **WHEN** the user expands an empty directory
- **THEN** the explorer shows an explicit empty-folder message instead of remaining in a loading state

#### Scenario: Directory listing fails

- **WHEN** the explorer cannot list an expanded directory (for example, permission denied or the path no longer exists)
- **THEN** the explorer shows an explicit error message for that folder instead of remaining in a loading state

### Requirement: Restored explorer expansion loads missing listings

When the UI restores expanded explorer paths from a session snapshot or per-project UI state, the system SHALL load directory listings for every restored expanded path that does not already have cached entries.

#### Scenario: Session restore with expanded nested paths

- **WHEN** the client restores `expandedPaths` that include nested directories after startup or project activation
- **THEN** each restored expanded directory loads its children without requiring the user to collapse and re-expand the folder

#### Scenario: Project switch restores expanded tree

- **WHEN** the user switches back to a project whose in-memory UI bag includes expanded directories without cached listings
- **THEN** those expanded directories load their children automatically

### Requirement: Explorer refresh includes expanded directories

When the user triggers explorer refresh or an active Git status refresh detects workspace changes, the system SHALL reload listings for the workspace root and for every currently expanded directory, including paths that were expanded but never successfully listed.

#### Scenario: Refresh reloads open branches

- **WHEN** the user clicks the explorer refresh control with several folders expanded
- **THEN** the explorer reloads entries for the root and each expanded folder

#### Scenario: Active Git refresh reloads open branches

- **WHEN** an active Git status refresh detects a workspace change while several folders are expanded
- **THEN** the explorer reloads entries for the root and each affected currently expanded directory

#### Scenario: Git refresh finds no workspace change

- **WHEN** an active Git status refresh is equal to the previous Git status
- **THEN** the explorer does not perform a redundant full expanded-directory reload

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

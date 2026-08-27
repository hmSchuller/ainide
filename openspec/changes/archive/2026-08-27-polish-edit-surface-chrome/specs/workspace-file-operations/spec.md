## Purpose

Lets users create, rename, and delete workspace files and folders from the explorer through authenticated, path-safe server operations rather than ad hoc shell commands.

## ADDED Requirements

### Requirement: Users can delete workspace files and directories

The system SHALL allow the user to delete a workspace-relative file or directory through an authenticated HTTP API routed through the safe path resolver. Deleting a directory SHALL remove the directory and its contents within the workspace boundary.

#### Scenario: Delete a file

- **WHEN** the user deletes a text file that exists in the workspace
- **THEN** the file is removed from disk and subsequent listings no longer include it

#### Scenario: Delete a directory

- **WHEN** the user deletes a non-empty directory in the workspace
- **THEN** the directory and its descendants are removed from disk

#### Scenario: Path escape is rejected

- **WHEN** a delete request resolves outside the active workspace root
- **THEN** the server rejects the request and does not modify files

### Requirement: Users can rename workspace files and directories

The system SHALL allow the user to rename a workspace-relative file or directory to a new workspace-relative path through an authenticated HTTP API routed through the safe path resolver.

#### Scenario: Rename a file

- **WHEN** the user renames `src/old.ts` to `src/new.ts`
- **THEN** the file exists at the new path and no longer exists at the old path

#### Scenario: Rename into an existing path is rejected

- **WHEN** the user attempts to rename a file to a path that already exists
- **THEN** the server rejects the request and leaves both paths unchanged

### Requirement: Users can create files and directories

The system SHALL allow the user to create a new empty text file or directory at a workspace-relative path through authenticated HTTP APIs routed through the safe path resolver. Creating a file SHALL create parent directories when needed.

#### Scenario: Create a new file

- **WHEN** the user creates `docs/notes.md` in a folder that already exists
- **THEN** an empty text file is created at that path and appears in explorer listings

#### Scenario: Create nested directories

- **WHEN** the user creates a new folder `src/components/forms`
- **THEN** the directory hierarchy exists within the workspace and can be listed and expanded in the explorer

#### Scenario: Create outside workspace is rejected

- **WHEN** a create request resolves outside the active workspace root
- **THEN** the server rejects the request and does not create files

## Purpose

The workspace explorer shows the active project's directory tree and lets the user browse nested folders without leaving the cockpit.

## ADDED Requirements

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

When the user triggers explorer refresh, the system SHALL reload listings for the workspace root and for every currently expanded directory, including paths that were expanded but never successfully listed.

#### Scenario: Refresh reloads open branches

- **WHEN** the user clicks the explorer refresh control with several folders expanded
- **THEN** the explorer reloads entries for the root and each expanded folder

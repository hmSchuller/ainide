# workspace-git-polling Specification

## Purpose

Provides efficient, focus-aware synchronization of Git-backed workspace state without requiring ainide to recursively watch every file and directory during startup.

## Requirements

### Requirement: Git status polls while the application is active

For an active Git-backed workspace, the system SHALL request the authenticated Git status snapshot at most once every 2 seconds while the ainide browser document is visible and the browser window is focused. The system SHALL stop scheduled polling while the document is hidden or the window is unfocused.

#### Scenario: Active application polls Git status

- **WHEN** a Git-backed workspace is open and the ainide document is visible and focused
- **THEN** the system requests the current Git status no more frequently than once every 2 seconds

#### Scenario: Hidden application stops polling

- **WHEN** the ainide document becomes hidden or the browser window loses focus
- **THEN** the system cancels or suppresses scheduled Git status requests until the application becomes active again

#### Scenario: Application becomes active again

- **WHEN** the ainide document becomes visible and focused after polling was stopped
- **THEN** the system performs one immediate Git status refresh and resumes the 2-second active polling cadence

#### Scenario: Poll request is still running

- **WHEN** the next polling interval arrives while the previous Git status request has not completed
- **THEN** the system does not start a concurrent Git status request

### Requirement: Git status changes reconcile workspace state

When an active Git status response differs from the previous response, the system SHALL update the visible Git summary and changed-file state, refresh affected explorer state, and inspect affected open files for external changes. The system SHALL preserve dirty editor buffers and expose a conflict state instead of overwriting them with disk content.

#### Scenario: External tracked file change is detected

- **WHEN** an active Git status response reports a changed, added, deleted, renamed, or conflicted path that was not present in the previous response
- **THEN** the system updates Git state, marks the path as recent, and refreshes the relevant explorer state

#### Scenario: Clean open file changes externally

- **WHEN** polling identifies a changed path that is open in an editor and the buffer has no unsaved edits
- **THEN** the system reloads the disk content into the buffer and keeps the buffer marked saved

#### Scenario: Dirty open file changes externally

- **WHEN** polling identifies a changed path that is open in an editor and the buffer has unsaved edits
- **THEN** the system retains the unsaved buffer and records the external disk content as a conflict for user resolution

#### Scenario: Git status request fails

- **WHEN** a scheduled Git status request fails
- **THEN** the system retains the last successful Git state, reports the refresh failure through the existing notice mechanism, and continues allowing a later active refresh

### Requirement: Workspace startup does not depend on recursive watcher enumeration

Opening ainide or restoring a Git-backed workspace SHALL NOT require a recursive filesystem watcher to enumerate the entire workspace before the backend can serve requests. The system SHALL remain usable when the workspace contains more files or directories than the host watcher limit supports.

#### Scenario: Large Git workspace starts

- **WHEN** ainide starts with a large Git-backed workspace available for restoration
- **THEN** the backend becomes available without waiting for a full recursive watcher scan and without failing because of a host file-watcher limit

### Requirement: Non-Git workspaces retain explicit refresh behavior

For a workspace that is not a Git repository, the system SHALL retain existing explicit explorer and Git refresh actions and SHALL NOT present an unavailable Git status response as detected file changes.

#### Scenario: Non-Git workspace is active

- **WHEN** the active workspace is not a Git repository
- **THEN** the system reports the existing non-repository Git state, does not infer external file changes from that response, and keeps explicit explorer refresh available

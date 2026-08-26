## Purpose

Lets one ainide process hold several local projects at once, show only the active project in the cockpit, keep each project's terminals running across switches and browser reconnects, and resume the project set from a local session snapshot.

## ADDED Requirements

### Requirement: One visible project among several live projects

The system SHALL allow more than one project to be open in a single ainide process and SHALL present exactly one of them as the active project in the cockpit. The explorer, editor, Git summary, review surface, and terminal tabs SHALL belong to the active project only.

#### Scenario: First project opens as today

- **WHEN** the user opens the first project directory
- **THEN** that project becomes active and the cockpit shows its files, Git status, and terminals

#### Scenario: A second project can be opened without replacing the first

- **WHEN** at least one project is already open and the user opens a different existing directory
- **THEN** the new directory becomes the active project and the previous project remains open but is not visible

#### Scenario: The cockpit never shows two projects at once

- **WHEN** two or more projects are open
- **THEN** the workbench displays only the active project's explorer, editor, and terminals

### Requirement: Users can switch and close projects

The system SHALL provide a way to switch the active project among open projects, to add another project, and to close an open project. Closing a project SHALL take it out of the open set. Switching SHALL NOT close other projects.

#### Scenario: Switch to another open project

- **WHEN** the user selects a different open project
- **THEN** that project becomes active and the previously active project remains open in the background

#### Scenario: Close the active project while others remain

- **WHEN** the user closes the active project and at least one other project is open
- **THEN** the closed project is no longer open and another remaining project becomes active

#### Scenario: Close the last project

- **WHEN** the user closes the only open project
- **THEN** the cockpit returns to the workspace picker and no project is active

#### Scenario: Same directory is not opened twice

- **WHEN** the user opens a directory whose resolved path is already an open project
- **THEN** that existing project becomes active and a second live copy is not created

### Requirement: Terminals survive project switch and browser reconnect

While a project remains open, the system SHALL keep its PTY sessions alive when the user switches to another project and when the browser disconnects. The system SHALL NOT spawn a duplicate default terminal of a kind that is already alive for that project when the UI reconnects or the project becomes active again. PTY sessions SHALL end when the user closes that project or when the ainide process exits.

#### Scenario: Agent keeps running after a switch

- **WHEN** a project has a living agent terminal and the user switches to another project
- **THEN** that agent process remains running

#### Scenario: Agent is still there after switching back

- **WHEN** the user switches back to a project that still has living terminals
- **THEN** the cockpit shows those existing sessions, including prior scrollback, rather than creating new ones of the same kind

#### Scenario: Browser close does not kill terminals

- **WHEN** the browser disconnects while the ainide process is still running
- **THEN** open projects' PTY sessions remain alive

#### Scenario: Browser reopen attaches existing terminals

- **WHEN** the browser reconnects to the same ainide process
- **THEN** the UI restores the last active project and attaches to that project's existing PTY sessions without duplicating default agent, shell, or lazygit sessions that are already alive

#### Scenario: Closing a project kills only that project's terminals

- **WHEN** the user closes one of several open projects
- **THEN** that project's PTY sessions are terminated and other open projects' PTY sessions remain alive

### Requirement: Unsaved editor buffers survive a switch in the same browser session

While the browser remains connected, the system SHALL keep each open project's editor tabs, including unsaved contents and conflict state, when the user switches away and back. The system SHALL NOT write unsaved editor contents to disk as part of a project switch.

#### Scenario: Dirty buffer remains after switching away and back

- **WHEN** the active project has an unsaved editor tab and the user switches to another project and back without closing the browser
- **THEN** that tab is still open with the unsaved contents and is not saved automatically

#### Scenario: Browser close drops unsaved buffers

- **WHEN** the browser is closed while a tab has unsaved contents
- **THEN** a later reconnect of that browser to the same process restores the tab from the saved path by reading the file from disk, not the discarded unsaved contents

### Requirement: Filesystem and events stay scoped to the active project

File list, read, write, search, and Git operations SHALL apply only to the active project's root and SHALL continue to reject paths that escape that root. Live file and Git events for a hidden project SHALL NOT update the visible explorer, editor, or Git summary.

#### Scenario: Writes stay in the active root

- **WHEN** the user saves a file while a project is active
- **THEN** the write is resolved inside that project's root and cannot write outside it

#### Scenario: Hidden-project file activity does not mutate the visible editor

- **WHEN** a background project's agent changes a file on disk
- **THEN** the active project's open tabs and explorer are not updated as if that path belonged to the active project

#### Scenario: Switching applies the newly active project's disk state

- **WHEN** the user switches to a project whose files changed while it was hidden
- **THEN** the cockpit shows that project's Git status and file tree, and clean editor tabs for those files reload from disk

### Requirement: Session snapshots persist for resume after process restart

The system SHALL persist, in local config on this machine, the list of known projects, which project was last active, and per-project UI snapshots consisting of open file paths, pane and explorer layout, and which terminal kinds were present. The system SHALL NOT persist unsaved editor contents or the session token. After the ainide process starts, it SHALL restore that list so the user can reopen those projects; the last active project SHALL be opened when its directory still exists.

#### Scenario: Last active project is restored on process start

- **WHEN** the ainide process starts and a last-active project directory still exists
- **THEN** that project is opened as the active project and its saved file paths are reopened from disk

#### Scenario: Missing last-active directory is not a crash

- **WHEN** the ainide process starts and the last-active path is no longer a directory
- **THEN** the system reports that the project could not be opened and leaves the user able to pick or switch to another known project

#### Scenario: Unsaved contents are not written into the snapshot

- **WHEN** a session snapshot is saved
- **THEN** it contains file paths and layout, not editor buffer contents, and does not contain the session token

#### Scenario: A later start recreates terminals rather than reattaching them

- **WHEN** the ainide process starts and restores a project that previously had terminals
- **THEN** new PTY sessions of the recorded kinds are created because the previous processes did not survive process exit

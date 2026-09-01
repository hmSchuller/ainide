# project-build-commands Specification (delta)

## Purpose

Lets a user define a project's common build and test commands as labeled run configurations and start the selected one from the top bar as a terminal session in the project root, with one build running at a time.

## ADDED Requirements

### Requirement: A project can define labeled build commands

The system SHALL allow a project to define an ordered list of build commands, each consisting of a non-empty label and a non-empty shell command. Build commands SHALL be stored per project, keyed by the project's absolute root path, in the global configuration. A project with no stored build commands SHALL be treated as having an empty list, and a configuration without any build-command field SHALL remain valid.

#### Scenario: Define a build command

- **WHEN** the user adds a labeled command to a project through the settings surface
- **THEN** the command appears in the project's build command list in definition order and the list is persisted

#### Scenario: Build commands are per-project

- **WHEN** one project defines build commands
- **THEN** those commands are available for that project and do not affect the build commands of any other project

#### Scenario: No build commands is the default

- **WHEN** a project has no stored build commands, or the configuration file predates the field
- **THEN** the project is treated as having an empty build command list and the system behaves normally

### Requirement: Build command changes persist and apply without a restart

The system SHALL persist a project's build command list to the global configuration file and apply changes to the running server immediately, so the user does not need to restart the server.

#### Scenario: List survives a restart

- **WHEN** a user saves build commands for a project and the server later restarts
- **THEN** those build commands are still defined for that project

#### Scenario: Change reflects immediately

- **WHEN** the user saves an edited build command list for the active project
- **THEN** subsequent reads of the project's build commands return the new list without a restart

### Requirement: The builds settings operations identify the project by root path

The system SHALL provide an operation to read a project's build commands and an operation to replace the project's entire build command list. The project SHALL be identified by its absolute root path supplied in the request body, and the operations SHALL work for root paths containing characters that are not valid in a URL path segment, including spaces, non-ASCII characters, quotes, and reserved object keys.

#### Scenario: Read a project's build commands

- **WHEN** the client requests the build commands for a known project
- **THEN** the response lists the project's build commands with their labels and commands in definition order

#### Scenario: Replace a project's build commands

- **WHEN** the client submits a new build command list for a known project
- **THEN** the project's build command list is replaced, persisted, and reflected in subsequent reads

#### Scenario: Root path with special characters

- **WHEN** a project's root path contains spaces, non-ASCII characters, or a reserved object key such as `__proto__`
- **THEN** its build commands can be set, read, and persisted without corrupting or dropping the entry

### Requirement: The builds settings operations validate their input

The system SHALL reject a build command update whose project root path is not a known or open project, whose list exceeds the maximum number of entries, or whose entries contain labels or commands that are empty after trimming or exceed the maximum length. The system SHALL NOT treat a client-supplied root path as a filesystem path to resolve.

#### Scenario: Unknown project is rejected

- **WHEN** the client submits build commands for a root path that is not a known or open project
- **THEN** the update is rejected and no configuration entry is created for it

#### Scenario: Blank entry is rejected

- **WHEN** the submitted list contains an entry whose label or command is empty after trimming
- **THEN** the update is rejected and the project's existing list is unchanged

#### Scenario: Oversized list is rejected

- **WHEN** the submitted list exceeds the maximum number of entries or an entry exceeds the maximum label or command length
- **THEN** the update is rejected and the project's existing list is unchanged

### Requirement: The project settings surface exposes the build commands

The system SHALL provide a per-project build commands editor in the project settings surface, reachable from the project switcher, that shows the active project's build commands and lets the user add, edit, and remove labeled commands and save the resulting list.

#### Scenario: Add a build command

- **WHEN** the user adds a new label and command in the build commands editor and saves
- **THEN** the new command is persisted for the active project and appears in the top-bar build runner

#### Scenario: Edit a build command

- **WHEN** the user changes an existing command's label or command text and saves
- **THEN** the persisted entry is updated accordingly

#### Scenario: Remove a build command

- **WHEN** the user removes an entry from the build commands editor and saves
- **THEN** the entry no longer appears in the project's build command list

### Requirement: The top bar offers a build runner

The system SHALL show a build command dropdown and a run control in the top bar while a project is active, visible in all primary modes. The dropdown SHALL list the active project's build commands by label in definition order. The selected command SHALL default to the first defined command, and the last selected command SHALL be remembered per project and restored as the selection when that project becomes active again.

#### Scenario: Selection list

- **WHEN** the active project defines build commands
- **THEN** the dropdown lists their labels in definition order and the run control can start the selected one

#### Scenario: Remembered selection

- **WHEN** the user selects a build command, then later switches away from and back to the project
- **THEN** that command is selected again

#### Scenario: Selection is per-project

- **WHEN** the user switches to another project
- **THEN** that project's own build commands and remembered selection are shown, not the previous project's

### Requirement: The build runner shows an empty state

While the active project has no build commands, the build command dropdown SHALL be disabled and SHALL display a hint directing the user to define build commands in project settings, and the run control SHALL be disabled.

#### Scenario: No commands defined

- **WHEN** the active project has an empty build command list
- **THEN** the dropdown is disabled with the hint, the run control is disabled, and pressing it does not start anything

### Requirement: Running a build executes the selected command as a terminal session

When the user starts the selected build command, the system SHALL start a build terminal session that executes the command through the project's configured shell with the project root as the working directory. The session's title SHALL be the command's label. The run action SHALL make the terminal utility panel visible and focus the new session. The session SHALL appear in the terminal utility panel like any other terminal session, and the terminal's existing exit reporting, including the exit code, SHALL apply to build sessions.

#### Scenario: Start a build

- **WHEN** the user presses the run control with a build command selected and no build is running
- **THEN** a new build terminal session starts with the command in the project root, the terminal utility panel is visible, and the new session is focused

#### Scenario: Build output is visible

- **WHEN** a build produces output
- **THEN** the output appears in the focused build terminal session

#### Scenario: Exit code is reported

- **WHEN** a build process exits
- **THEN** the build session reports the process as exited with its exit code

#### Scenario: A build terminal can be closed from the panel

- **WHEN** the user closes a build terminal from the terminal utility panel
- **THEN** the session is closed like any other terminal session, and if it was the running build, the run control reverts to the start state

### Requirement: At most one build runs at a time

The system SHALL allow at most one live build session per project. While a build session is alive, the run control SHALL act as a stop control for that session, and the user SHALL NOT be able to start a different build command until the running build exits or is stopped. Stopping a build SHALL terminate the process while leaving the session in the terminal utility panel as exited.

#### Scenario: Stop the running build

- **WHEN** a build session is alive and the user presses the run control
- **THEN** the running build process is terminated, its session remains in the terminal utility panel as exited, and the control reverts to the start state

#### Scenario: Starting a different command is blocked

- **WHEN** a build session is alive and the user selects a different build command
- **THEN** that command cannot be started until the running build exits or is stopped

#### Scenario: Running again after exit

- **WHEN** a running build exits on its own
- **THEN** the run control is available again and the user can start a build

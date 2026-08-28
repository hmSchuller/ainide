## Purpose

Provides a dedicated primary workspace for interactive Git operations through the existing local Lazygit terminal session.

## ADDED Requirements

### Requirement: Primary modes have a stable user-visible order

The primary mode navigation SHALL present modes in this order: Edit, Review, Agents, and LazyGit. The application SHALL provide mode changes through clickable primary tabs and the command palette, and SHALL NOT register direct numeric shortcuts for mode changes.

#### Scenario: User sees the primary mode navigation

- **WHEN** a workspace is open
- **THEN** the primary navigation displays Edit first, Review second, Agents third, and LazyGit fourth

#### Scenario: User changes mode without a numeric shortcut

- **WHEN** the user selects a mode tab or chooses a mode action from the command palette
- **THEN** the application switches to that mode without requiring or advertising a browser-conflicting numeric shortcut

### Requirement: LazyGit is a standalone primary mode

LazyGit SHALL be presented as a full-height primary work surface rather than as a tab in the utility terminal footer or as a tool inside Agents mode. The LazyGit surface SHALL use the active project's Lazygit terminal session.

#### Scenario: User opens LazyGit mode

- **WHEN** the user selects LazyGit from the primary navigation or command palette
- **THEN** the active project's Lazygit session is displayed in a dedicated full-height surface

#### Scenario: LazyGit is absent from other mode surfaces

- **WHEN** the user opens Edit, Review, or Agents mode
- **THEN** Lazygit is not rendered in the Edit utility footer, Review surface, or Agents workbench

### Requirement: LazyGit sessions remain project-scoped and reusable

The system SHALL reuse the active project's existing live Lazygit session when entering LazyGit mode and SHALL NOT create a duplicate session solely because the user changes modes. Switching away from and back to LazyGit SHALL preserve the session's process and available terminal output.

#### Scenario: User returns to an existing LazyGit session

- **WHEN** a live Lazygit session exists for the active project and the user enters LazyGit mode
- **THEN** the existing session is displayed without starting a second Lazygit process

#### Scenario: User switches away from LazyGit

- **WHEN** the user switches from LazyGit to Edit, Review, or Agents
- **THEN** the Lazygit process continues running and can be displayed again with its existing session identity and output

#### Scenario: Hidden project Lazygit remains isolated

- **WHEN** the user switches to another open project
- **THEN** the previous project's Lazygit session is not displayed or attachable from the newly active project's LazyGit mode

### Requirement: LazyGit availability failures are actionable

The system SHALL keep the LazyGit mode accessible when the optional `lazygit` command is unavailable or its session exits. The surface SHALL present a clear availability or exit message and SHALL not replace the failure with an empty successful terminal state.

#### Scenario: Lazygit is not installed

- **WHEN** the user opens LazyGit mode and the `lazygit` command is unavailable
- **THEN** the surface explains that Lazygit is unavailable and indicates that installing the command is required

#### Scenario: Lazygit exits

- **WHEN** the Lazygit process exits
- **THEN** the LazyGit surface identifies the session as exited and keeps its available output viewable until the session is closed or restarted

### Requirement: LazyGit mode is restorable per project

The system SHALL persist and restore the active project's LazyGit mode selection using the existing project session snapshot mechanism. Snapshots SHALL contain only mode and existing terminal-kind metadata, never terminal output, process identifiers, commands, or session tokens.

#### Scenario: User restarts ainide while LazyGit mode is active

- **WHEN** the saved active project has LazyGit as its last mode
- **THEN** the project restores into LazyGit mode and recreates or attaches to the project's Lazygit session according to the existing terminal restoration lifecycle

## MODIFIED Requirements

### Requirement: Agents is a primary work mode

The system SHALL provide an Agents mode alongside the Edit, Review, and LazyGit modes. Agents mode SHALL present a dedicated workbench for agent sessions rather than relying on the resizable terminal footer, and switching modes SHALL NOT terminate live agent sessions.

#### Scenario: User opens the Agents mode

- **WHEN** the user selects Agents from the primary mode controls
- **THEN** the workbench shows only the active project's agent session navigator and agent terminal workspace

#### Scenario: User leaves Agents mode

- **WHEN** the user switches from Agents to Edit, Review, or LazyGit
- **THEN** all live agent processes continue running and the user can return to their sessions later

### Requirement: Agents are scoped to the active project

The Agents workbench SHALL display only agent sessions belonging to the active project. Sessions belonging to hidden open projects SHALL continue running, and switching back to that project SHALL show its existing agent sessions rather than creating duplicates.

#### Scenario: Hidden project agent continues

- **WHEN** the user switches from a project with a running agent to another open project
- **THEN** the hidden project's agent remains running and is not displayed as a session in the newly active project's Agents workbench

#### Scenario: User switches back to a project

- **WHEN** the user returns to a project whose agent sessions continued running while hidden
- **THEN** the Agents workbench lists those existing agent sessions with their existing identities and output

## REMOVED Requirements

### Requirement: Non-agent terminal tools remain available

**Reason**: Utility terminal sessions are being moved out of Agents mode so that the workbench is dedicated to supervising agent sessions. Shell and custom terminals remain available in Edit mode, and Lazygit has its own primary mode.

**Migration**: Use the Edit mode utility terminal for shell or custom sessions, or select the standalone LazyGit mode for interactive Git operations.

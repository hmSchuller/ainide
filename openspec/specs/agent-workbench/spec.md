# agent-workbench Specification

## Purpose

Lets users run and supervise multiple local agent sessions as named parallel work windows instead of treating them as hidden terminal tabs.

## Requirements

### Requirement: Agents is a primary work mode

The system SHALL provide an Agents mode alongside the Edit, Review, and LazyGit modes. Agents mode SHALL present a dedicated workbench for agent sessions rather than relying on the resizable terminal footer, and switching modes SHALL NOT terminate live agent sessions.

#### Scenario: User opens the Agents mode

- **WHEN** the user selects Agents from the primary mode controls
- **THEN** the workbench shows only the active project's agent session navigator and agent terminal workspace

#### Scenario: User leaves Agents mode

- **WHEN** the user switches from Agents to Edit, Review, or LazyGit
- **THEN** all live agent processes continue running and the user can return to their sessions later

### Requirement: Users can run multiple agent sessions for one project

The system SHALL allow the user to create more than one live agent session for the active project, including sessions of the same agent kind. Creating an additional agent SHALL NOT replace, deduplicate, or terminate an existing agent session.

#### Scenario: Two agents run concurrently

- **WHEN** the user starts a second agent while an agent is already running for the active project
- **THEN** both agent processes remain live and appear as separate sessions

#### Scenario: A session is selected while another runs

- **WHEN** the user selects one agent session while another agent is running
- **THEN** the selected session's output is shown and the unselected agent continues running

### Requirement: Agent sessions have identifiable status and names

The system SHALL show each agent session with a user-visible title and reliable process status. The user SHALL be able to distinguish at least live and exited sessions and SHALL be able to rename a session for its purpose, such as implementation or planning.

#### Scenario: User distinguishes parallel work

- **WHEN** two agent sessions have been named "Implement" and "Plan next task"
- **THEN** the Agents navigator displays those titles and their individual live or exited status

#### Scenario: An agent exits

- **WHEN** an agent process exits
- **THEN** its session remains identifiable as exited and its available terminal output remains viewable until the user closes the session

### Requirement: Users can view one or two agent sessions

The system SHALL provide a focused view of a selected agent session and SHALL allow the user to optionally pin a second agent session for side-by-side observation. Changing the focused or pinned session SHALL NOT affect either process.

#### Scenario: User observes implementation and planning together

- **WHEN** the user pins the Implement and Plan next task sessions
- **THEN** the Agents workbench displays both live terminal views with independent output

#### Scenario: User returns to a focused session

- **WHEN** the user switches from a two-session view to one selected session and later selects the other
- **THEN** each session remains attachable with its available scrollback and current process status

### Requirement: Agents are scoped to the active project

The Agents workbench SHALL display only agent sessions belonging to the active project. Sessions belonging to hidden open projects SHALL continue running, and switching back to that project SHALL show its existing agent sessions rather than creating duplicates.

#### Scenario: Hidden project agent continues

- **WHEN** the user switches from a project with a running agent to another open project
- **THEN** the hidden project's agent remains running and is not displayed as a session in the newly active project's Agents workbench

#### Scenario: User switches back to a project

- **WHEN** the user returns to a project whose agent sessions continued running while hidden
- **THEN** the Agents workbench lists those existing agent sessions with their existing identities and output

### Requirement: Agent session descriptors support restart recreation

The system SHALL persist enough per-project metadata for each recorded agent session to recreate the recorded sessions as new PTY processes after an ainide process restart. The persisted metadata SHALL NOT include session tokens, PTY identifiers, process identifiers, terminal scrollback, or reference-kit contents.

#### Scenario: Multiple recorded agents are restored

- **WHEN** an ainide process restarts after the user has recorded separate Implement and Plan next task agent sessions
- **THEN** the restored project creates two new agent sessions with those user-visible purposes and does not claim to reattach the old processes

#### Scenario: Browser reconnect uses live sessions

- **WHEN** the browser reconnects while the ainide process and its agent sessions remain running
- **THEN** the Agents workbench attaches to the existing sessions without creating duplicate agents

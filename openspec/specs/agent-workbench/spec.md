# agent-workbench Specification

## Purpose

Lets users run and supervise multiple local agent sessions as named parallel work windows instead of treating them as hidden terminal tabs.

## Requirements

### Requirement: Agents is a primary work mode

The system SHALL provide an Agents mode alongside the Edit, Review, and LazyGit modes. Agents mode SHALL present a dedicated workbench for the active project's agent sessions, including structured conversation and activity surfaces for ACP sessions and terminal surfaces for PTY sessions. Switching modes SHALL NOT terminate live agent sessions.

#### Scenario: User opens the Agents mode

- **WHEN** the user selects Agents from the primary mode controls
- **THEN** the workbench shows only the active project's agent session navigator and the selected session surface appropriate to its ACP or PTY transport

#### Scenario: User leaves Agents mode

- **WHEN** the user switches from Agents to Edit, Review, or LazyGit
- **THEN** all live agent processes continue running and the user can return to their sessions later

### Requirement: Users can run multiple agent sessions for one project

The system SHALL allow the user to create more than one agent session for the active project, including multiple sessions using the same ACP provider or PTY command. Creating an additional agent SHALL NOT replace, deduplicate, or terminate an existing agent session.

#### Scenario: Two agents run concurrently

- **WHEN** the user starts a second agent while an agent is already running for the active project
- **THEN** both sessions remain live, retain independent identities and state, and appear as separate sessions

#### Scenario: A session is selected while another runs

- **WHEN** the user selects one agent session while another agent is running
- **THEN** the selected session's output is shown and the unselected agent continues running

### Requirement: Agent sessions have identifiable status and names

The system SHALL show each agent session with a user-visible title and reliable connection or process status. A title MAY initially be a provisional provider label and MAY later be supplied by the ACP provider. The user SHALL be able to distinguish at least connecting, live, waiting for user input, disconnected, and exited states when applicable, and SHALL be able to rename a session for its purpose. After an explicit user rename, the user-selected title SHALL remain authoritative over later provider-generated title updates, including after session restoration.

#### Scenario: User distinguishes sessions and providers

- **WHEN** two sessions have titles supplied by the user or their providers and use different configured ACP providers
- **THEN** the Agents navigator displays each title, provider identity, and individual current status

#### Scenario: Provider title replaces a provisional title

- **WHEN** an ACP session initially displays its provider label and the provider later supplies a valid session title
- **THEN** the Agents navigator updates that session's visible title without changing its provider identity, status, conversation, or terminal state

#### Scenario: User rename overrides provider title

- **WHEN** the user renames an ACP session and the provider later supplies another title
- **THEN** the Agents navigator retains the user-selected title

#### Scenario: User distinguishes parallel work

- **WHEN** two agent sessions have been named "Implement" and "Plan next task"
- **THEN** the Agents navigator displays those titles and their individual live or exited status

#### Scenario: An agent exits or disconnects

- **WHEN** an ACP connection or PTY agent process exits unexpectedly
- **THEN** its session remains identifiable as disconnected or exited and its available conversation, tool activity, or terminal output remains viewable until the user closes the session

#### Scenario: An agent exits

- **WHEN** an agent process exits
- **THEN** its session remains identifiable as exited and its available terminal output remains viewable until the user closes the session

### Requirement: Users can view one or two agent sessions

The system SHALL provide a focused view of a selected agent session and SHALL allow the user to optionally pin a second agent session for side-by-side observation. Changing the focused or pinned session SHALL NOT affect either session's provider connection, process, conversation, or terminal state.

#### Scenario: User observes two sessions together

- **WHEN** the user pins an ACP session and a PTY session or two ACP sessions
- **THEN** the Agents workbench displays both session surfaces with independent updates and controls

#### Scenario: User observes implementation and planning together

- **WHEN** the user pins the Implement and Plan next task sessions
- **THEN** the Agents workbench displays both live terminal views with independent output

#### Scenario: User returns to a focused session

- **WHEN** the user switches from a two-session view to one selected session and later selects the other
- **THEN** each session remains attachable with its available scrollback and current process status

### Requirement: Agents are scoped to the active project

The Agents workbench SHALL display only agent sessions belonging to the active project. Sessions belonging to hidden open projects SHALL continue running, and switching back to that project SHALL show its existing ACP and PTY sessions rather than creating duplicates. Agent updates and user actions SHALL not cross project boundaries.

#### Scenario: Hidden project agent continues

- **WHEN** the user switches from a project with a running agent to another open project
- **THEN** the hidden project's agent remains running and is not displayed as a session in the newly active project's Agents workbench

#### Scenario: User switches back to a project

- **WHEN** the user returns to a project whose agent sessions continued running while hidden
- **THEN** the Agents workbench lists those existing agent sessions with their existing identities and output

### Requirement: The agent workbench reflects actual sessions

The system SHALL NOT create an agent PTY solely when opening or switching a project. When the active project has no retained PTY or ACP agent sessions, the Agents mode SHALL display its empty state and leave agent creation to an explicit user action. Explicit PTY and ACP agent creation actions remain available.

#### Scenario: Project opens without agents

- **WHEN** a project is opened or switched to and it has no retained PTY or ACP agent sessions
- **THEN** the system does not start an agent PTY and the Agents mode displays an empty view with an explicit action to start an agent

### Requirement: Agent session descriptors support restart recreation or ACP resume

The system SHALL persist enough per-project metadata for each recorded agent session to either recreate a PTY process or attempt a supported ACP session load or resume after an ainide process restart. Persisted metadata SHALL NOT include session tokens, authentication secrets, provider environment secrets, process identifiers, terminal scrollback, or unsent reference-kit contents. The system SHALL not claim that a new or non-resumable ACP session is the prior conversation.

#### Scenario: Recorded PTY agents are restored

- **WHEN** an ainide process restarts after the user has recorded PTY agent sessions
- **THEN** the restored project creates new PTY sessions with those user-visible purposes and does not claim to reattach the old processes

#### Scenario: Recorded ACP session is resumable

- **WHEN** an ainide process restarts after the user has recorded an ACP session whose provider supports loading or resuming
- **THEN** the system attempts the supported ACP restoration using the persisted provider session identity and reports whether the prior conversation was restored

#### Scenario: Browser reconnect uses live sessions

- **WHEN** the browser reconnects while the ainide process and its ACP or PTY agent sessions remain running
- **THEN** the Agents workbench attaches to the existing sessions without creating duplicate agents

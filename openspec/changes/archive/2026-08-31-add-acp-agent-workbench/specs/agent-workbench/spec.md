## MODIFIED Requirements

### Requirement: Agents is a primary work mode

The system SHALL provide an Agents mode alongside the Edit, Review, and LazyGit modes. Agents mode SHALL present a dedicated workbench for the active project's agent sessions, including structured conversation and activity surfaces for ACP sessions and terminal surfaces for PTY sessions. Switching modes SHALL NOT terminate live agent sessions.

#### Scenario: User opens the Agents mode

- **WHEN** the user selects Agents from the primary mode controls
- **THEN** the workbench shows only the active project's agent session navigator and the selected session surface appropriate to its ACP or PTY transport

#### Scenario: User leaves Agents mode

- **WHEN** the user switches from Agents to Edit, Review, or LazyGit
- **THEN** all live ACP and PTY agent sessions continue running and the user can return to their sessions later

### Requirement: Users can run multiple agent sessions for one project

The system SHALL allow the user to create more than one agent session for the active project, including multiple sessions using the same ACP provider or PTY command. Creating an additional agent SHALL NOT replace, deduplicate, or terminate an existing agent session.

#### Scenario: Two agents run concurrently

- **WHEN** the user starts a second agent while an agent is already running for the active project
- **THEN** both sessions remain live, retain independent identities and state, and appear as separate sessions

#### Scenario: A session is selected while another runs

- **WHEN** the user selects one agent session while another is running
- **THEN** the selected session's conversation or terminal output is shown and the unselected agent continues running

### Requirement: Agent sessions have identifiable status and names

The system SHALL show each agent session with a user-visible title and reliable connection or process status. The user SHALL be able to distinguish at least connecting, live, waiting for user input, disconnected, and exited states when applicable, and SHALL be able to rename a session for its purpose.

#### Scenario: User distinguishes sessions and providers

- **WHEN** two sessions have been named "Implement" and "Review" and use different configured ACP providers
- **THEN** the Agents navigator displays their titles, provider identity, and individual current status

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
- **THEN** each session remains attachable with its accumulated conversation or terminal output and current status

### Requirement: Agents are scoped to the active project

The Agents workbench SHALL display only agent sessions belonging to the active project. Sessions belonging to hidden open projects SHALL continue running, and switching back to that project SHALL show its existing ACP and PTY sessions rather than creating duplicates. Agent updates and user actions SHALL not cross project boundaries.

#### Scenario: Hidden project agent continues

- **WHEN** the user switches from a project with a running ACP or PTY agent to another open project
- **THEN** the hidden project's agent remains running and is not displayed as a session in the newly active project's Agents workbench

#### Scenario: User switches back to a project

- **WHEN** the user returns to a project whose agent sessions continued running while hidden
- **THEN** the Agents workbench lists those existing sessions with their existing identities, state, and accumulated output

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

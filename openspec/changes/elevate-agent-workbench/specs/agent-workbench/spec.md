## ADDED Requirements

### Requirement: Workbench navigation is delegation- and attention-oriented
The Agents workbench SHALL organize active-project delegations by needs-user, review-ready, working, quiet or unknown, and ended state rather than presenting an undifferentiated process list. Each entry SHALL separately expose work state, execution transport state, continuity state, unread activity, and workspace strategy when applicable.

#### Scenario: Several delegations are active
- **WHEN** one delegation needs permission, one is working, and one is review-ready
- **THEN** the navigator prioritizes the blocking delegation and preserves the distinct state of all three without requiring the user to open each session

### Requirement: Agent creation is intent-first and exposes both transports
The system SHALL begin agent creation with delegation goal and optional success criteria, then offer every enabled ACP provider and the configured PTY agent as distinct execution choices. Before launch it SHALL show the selected workspace strategy and deterministic provider or transport capabilities relevant to safety, permissions, configuration, cancellation, and continuity.

#### Scenario: Only a PTY agent is configured
- **WHEN** the project has no available ACP providers but has a configured PTY agent command
- **THEN** the creation flow offers the PTY agent and does not present the project as having no usable agents

#### Scenario: User selects an ACP provider
- **WHEN** the user selects an enabled ACP provider
- **THEN** the flow explains its advertised capabilities and starts it only after the user confirms the delegation and workspace strategy

### Requirement: Session comparison has explicit semantics
The workbench SHALL show one primary delegation and MAY show one comparison delegation. Focus SHALL control what is viewed; comparison SHALL control the secondary surface; context destination SHALL default to the focused delegation unless the user explicitly locks a different destination. All three relationships SHALL be labelled and keyboard-operable.

#### Scenario: User compares two outcomes
- **WHEN** the user selects another delegation for comparison
- **THEN** both surfaces remain independently usable and the UI clearly identifies the focused view and current context destination

### Requirement: Workbench supervision is keyboard-first and responsive
The system SHALL support keyboard navigation among delegation groups, direct navigation to the next unresolved attention item, keyboard-accessible lifecycle actions, visible focus, modal focus containment and restoration, and a narrow-screen layout that keeps the active delegation and attention switcher reachable without scrolling through the full navigator.

#### Scenario: User handles attention by keyboard
- **WHEN** the user invokes the next-attention action
- **THEN** focus moves to the highest-priority unresolved item in its owning delegation with the decision controls reachable in logical order

#### Scenario: User supervises on a narrow viewport
- **WHEN** the workbench is shown on a narrow screen
- **THEN** it presents one active execution with a sticky delegation and attention switcher rather than stacking the complete navigator above all session content

### Requirement: Operational continuity is explicit
The workbench SHALL distinguish a connection to the same live process, a loaded or resumed provider conversation, a newly recreated PTY process, a fresh ACP context, reconnecting, confirmed exit, and failed lifecycle operations. It SHALL provide a visible continuity history for each execution.

#### Scenario: PTY is recreated after restart
- **WHEN** a persisted PTY descriptor creates a new process after server restart
- **THEN** the session is labelled recreated and is not presented as the prior live process

#### Scenario: Browser reconnects
- **WHEN** the browser reconnects to an execution still owned by the same server process
- **THEN** the execution is labelled reattached and no duplicate process or provider session is created

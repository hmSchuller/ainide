## Purpose

Lets users define, supervise, complete, and retain a unit of agent work independently from the local process or provider conversation used to execute it.

## ADDED Requirements

### Requirement: Delegations preserve work intent above sessions
The system SHALL represent agent work as a project-scoped delegation with a user-visible goal, optional success criteria, creation time, lifecycle state, workspace strategy, and zero or more associated ACP or PTY executions. Replacing, resuming, or recreating an execution SHALL NOT silently create or discard the delegation.

#### Scenario: User creates work before choosing an execution
- **WHEN** the user starts a delegation and supplies a goal and optional success criteria
- **THEN** the system retains that intent while the user selects an ACP provider, PTY agent, and workspace strategy

#### Scenario: ACP context rolls over
- **WHEN** the user starts a fresh ACP context for an existing delegation
- **THEN** the new execution remains associated with that delegation and the prior execution remains identifiable in its history

### Requirement: Delegations have an explicit lifecycle
The system SHALL distinguish draft, active, needs-user, review-ready, blocked, completed, and archived delegation states. Provider or process activity MAY supply evidence for a transition, but completion and acceptance SHALL remain explicit and SHALL NOT be inferred from PTY output.

#### Scenario: ACP turn completes
- **WHEN** an ACP provider reports a completed turn
- **THEN** the delegation becomes review-ready or remains active according to its outstanding work and does not become accepted automatically

#### Scenario: User archives completed work
- **WHEN** the user accepts a completed delegation and archives it
- **THEN** it leaves the active work navigator while its safe intent, lifecycle, execution descriptors, and evidence metadata remain available locally

### Requirement: Lifecycle operations state their effect
The system SHALL offer distinct actions for stopping an execution, removing an execution record, starting a fresh context, archiving a delegation, and closing a project. A failed stop SHALL leave the execution visible with an actionable failure state, and no action SHALL imply that a provider context, process, delegation, or evidence record was removed when it was not.

#### Scenario: Process stop fails
- **WHEN** the user requests that a live execution stop and the server cannot confirm termination
- **THEN** the execution remains visible and the system reports that it may still be running

#### Scenario: Project contains live work
- **WHEN** the user attempts to close a project with live executions
- **THEN** the system describes which executions will terminate and requires explicit confirmation before closing the project

### Requirement: Safe delegation metadata survives restart
The system SHALL persist delegation intent, lifecycle, execution associations, continuity facts, outcomes, and bounded evidence metadata without persisting authentication secrets, session tokens, provider environment values, live protocol streams, terminal scrollback, or transient context contents. Existing recorded sessions SHALL migrate to clearly labelled legacy delegations without invented intent or attribution.

#### Scenario: Existing session is migrated
- **WHEN** ainide loads a pre-delegation session descriptor
- **THEN** it creates or presents a legacy unassigned delegation linked to that session and does not invent a goal, success criterion, or historical outcome

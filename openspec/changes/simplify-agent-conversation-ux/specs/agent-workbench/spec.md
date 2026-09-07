## MODIFIED Requirements

### Requirement: Agents is a primary work mode

The system SHALL provide an Agents mode alongside the Edit, Review, and LazyGit modes. Agents mode SHALL present a dedicated workbench for the active project's agent sessions, including structured conversation and activity surfaces for ACP sessions and terminal surfaces for PTY sessions. The workbench SHALL remain session-centric and SHALL NOT require a separate delegation object, goal, success criteria, evidence workflow, or archive action before starting or using a session. Switching modes SHALL NOT terminate live agent sessions.

#### Scenario: User opens the Agents mode

- **WHEN** the user selects Agents from the primary mode controls
- **THEN** the workbench shows only the active project's agent session navigator and the selected session surface appropriate to its ACP or PTY transport

#### Scenario: User leaves Agents mode

- **WHEN** the user switches from Agents to Edit, Review, or LazyGit
- **THEN** all live agent processes continue running and the user can return to their sessions later

## ADDED Requirements

### Requirement: Session supervision is conversation-first

The system SHALL make the selected ACP conversation the primary supervision surface. It SHALL visually distinguish user messages, agent responses, streaming activity, tool activity, pending permission or input requests, failures, reconnect state, and completion while retaining access to the ordered underlying activity. The surface SHALL not present provider-reported claims as independently verified system facts.

#### Scenario: Agent streams a tool-assisted response

- **WHEN** an ACP session emits a response together with tool activity
- **THEN** the conversation keeps the response readable, shows the related activity without overwhelming the response, and preserves the activity order for inspection

#### Scenario: User reads older conversation activity

- **WHEN** the user scrolls away from the bottom while new ACP activity arrives
- **THEN** the existing reading position remains stable and the conversation provides a clear action to return to the latest activity

#### Scenario: Session needs user input

- **WHEN** an ACP session has a pending permission, authentication, or structured-input request
- **THEN** the request is visible in the selected conversation with its available user actions and does not appear as ordinary completed activity

### Requirement: Provider-reported subagents are visible in the parent session

When the provider reports subagents or child-agent activity associated with an ACP session, the workbench SHALL display that activity within the parent session using the reported name, role, current activity, and state when available. Subagent information SHALL remain visually subordinate to the parent conversation, update the correct subagent independently, and SHALL NOT be inferred from generic tool output when the provider does not identify a subagent.

#### Scenario: Provider reports multiple subagents

- **WHEN** an ACP provider reports two subagents working for the selected session
- **THEN** the parent conversation shows both subagents with their available names or roles and current states without presenting them as separate top-level sessions

#### Scenario: Subagent activity changes

- **WHEN** the provider reports new activity or a terminal state for one subagent
- **THEN** only that subagent's display is updated and the parent conversation remains usable

#### Scenario: Provider does not identify subagents

- **WHEN** the provider emits ordinary tool activity without a subagent identity
- **THEN** the workbench displays the tool activity normally and does not invent a subagent entry or state

### Requirement: Session creation remains direct

The system SHALL let users start a configured ACP or PTY session through the existing session creation flow without requiring a delegation form or a complete description of intended work. A session MAY be named or renamed for its purpose, but the absence of a goal or success criteria SHALL NOT prevent session creation.

#### Scenario: User starts exploratory work

- **WHEN** the user selects a configured agent without entering a delegation goal or success criteria
- **THEN** the selected ACP or PTY session starts through the existing flow and appears in the active project's session list

## REMOVED Requirements

### Requirement: Delegation-first workbench supervision

**Reason**: A durable delegation, global attention model, evidence ledger, managed-worktree lifecycle, and delegation archive are unnecessary for polishing local agent conversations and add a second workflow above the existing session model.

**Migration**: Existing session descriptors, session titles, ACP/PTY transports, project scoping, and Review remain authoritative. Do not require users to migrate sessions into delegation records or persist delegation-only metadata.

#### Scenario: Existing session remains usable

- **WHEN** the application opens a project containing existing ACP or PTY sessions
- **THEN** the sessions appear directly in the session navigator without requiring delegation adoption or reconstruction

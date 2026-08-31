# acp-agent-sessions Specification

## Purpose

Lets ainide present Cursor, OpenCode, and other configured local ACP agents through one structured web client while preserving provider-specific capabilities and safe project boundaries.

## Requirements

### Requirement: Users can start configured ACP agent sessions

The system SHALL allow the user to choose a configured local ACP agent and start a named session for the active project. The ainide server SHALL launch the configured agent process over stdio, associate the session with the active project and absolute workspace root, and expose a local session identity distinct from the provider's ACP session identifier.

#### Scenario: User starts an OpenCode session

- **WHEN** the user selects a configured OpenCode ACP agent for the active project and confirms a session name
- **THEN** the server launches the provider's ACP command locally, completes the connection setup, and shows the new session in the active project's agent workbench

#### Scenario: Configured ACP command is unavailable

- **WHEN** the user starts a provider whose executable or required arguments are unavailable
- **THEN** the system reports a startup error, does not create a live session, and leaves existing sessions unchanged

### Requirement: ACP connections negotiate protocol and authentication

The system SHALL initialize each ACP connection using a supported stable protocol version and shall advertise only capabilities that ainide actually implements. The system SHALL authenticate only with an authentication method advertised by the agent and SHALL surface authentication-required or authentication-failed states without exposing provider credentials to the browser.

#### Scenario: Agent advertises an authentication method

- **WHEN** an ACP agent returns an authentication method during initialization
- **THEN** the system offers the corresponding provider login action or reports that the agent must be authenticated through its supported local flow before creating a usable session

#### Scenario: Agent omits an optional capability

- **WHEN** an ACP agent does not advertise an optional method or capability
- **THEN** the system does not call that method and presents the session with the supported subset of controls

### Requirement: Users can select advertised session configuration

The system SHALL display model and other session configuration options returned by the selected ACP agent during session setup or later configuration updates. A selection SHALL be scoped to the selected agent session and SHALL be sent using the ACP configuration method with the advertised option identifier and value. The system SHALL NOT invent model options when the agent does not advertise them.

#### Scenario: Agent supplies model options

- **WHEN** an ACP session returns a selectable configuration option categorized as a model
- **THEN** the session header exposes the available labels and current value, and choosing another value updates that ACP session without changing other sessions

#### Scenario: Agent has no model selector

- **WHEN** an ACP session does not return a model configuration option
- **THEN** the system shows the provider's current or default model state when available and does not display a misleading universal model list

#### Scenario: Configuration options change

- **WHEN** the agent sends a configuration update or returns a new complete option set after a selection
- **THEN** the session replaces its displayed options and preserves the agent-reported current values

### Requirement: Users can send prompts and receive structured session updates

The system SHALL let the user send a text prompt with optional supported context to a selected ACP session and SHALL render updates associated with that session in arrival order. The rendered session history SHALL distinguish user content, agent content, tool calls, plans, file locations, diffs, terminal output, usage information, completion, failure, and cancellation when those updates are provided.

#### Scenario: Agent streams a tool-assisted response

- **WHEN** the user sends a prompt and the agent emits message chunks followed by a tool call and further message chunks
- **THEN** the workbench appends the chunks to the correct conversation, shows the tool's progress and result, and does not merge the activity into another session

#### Scenario: Agent reports a file change

- **WHEN** an ACP update includes a file location or diff for a workspace file
- **THEN** the user can inspect the referenced file or change from the agent surface and the ordinary workspace change detection remains active

#### Scenario: Unknown update content is received

- **WHEN** the agent sends an update variant that the current UI does not understand
- **THEN** the session remains connected, preserves enough metadata for inspection or debugging, and reports the update without treating it as a completed prompt

### Requirement: Users can respond to ACP permission and elicitation requests

The system SHALL present pending standard ACP permission requests and supported structured user-input requests in the associated session. The system SHALL not automatically approve a request by default, SHALL return the user's selected outcome to the requesting agent, and SHALL complete pending requests with a cancelled or rejected outcome when the session or prompt is cancelled.

#### Scenario: Agent requests permission to execute a command

- **WHEN** an ACP agent sends a permission request with multiple options
- **THEN** the workbench shows the operation and available choices, and the agent receives the option selected by the user

#### Scenario: User cancels while permission is pending

- **WHEN** the user cancels the active prompt while a permission request is awaiting a decision
- **THEN** the system resolves the pending request as cancelled or rejected according to the protocol and the session reports the cancelled turn

### Requirement: ACP filesystem and terminal requests stay within the session workspace

When ainide advertises ACP filesystem or terminal capabilities, the server SHALL service requests using absolute paths and working directories validated against the ACP session's selected workspace boundary. The system SHALL reject path escapes, cross-project requests, and invalid terminal lifecycle operations without modifying files or executing the rejected command.

#### Scenario: Agent reads a file in its workspace

- **WHEN** an ACP agent requests a text file under its session workspace
- **THEN** the server returns the file content through the ACP response and the request is associated with that session's project

#### Scenario: Agent requests a path outside its workspace

- **WHEN** an ACP filesystem or terminal request resolves outside the session workspace
- **THEN** the server rejects the request and does not read, write, or execute at that path

#### Scenario: Agent runs and releases a terminal

- **WHEN** an ACP agent creates a command terminal and later waits for, kills, or releases it
- **THEN** the server returns the appropriate terminal state and cleans up the command resources when the terminal is released

### Requirement: ACP sessions survive UI detachment and clean up explicitly

The system SHALL keep a live ACP session and its provider process running when the browser disconnects or the user leaves Agents mode, subject to normal server lifecycle. The system SHALL provide cancellation and cleanup behavior for prompt cancellation, session close, active-project close, provider process exit, and ainide shutdown.

#### Scenario: Browser disconnects during an active session

- **WHEN** the browser connection closes while an ACP agent is processing a prompt
- **THEN** the server keeps the session state and provider process alive, and a later browser connection can observe the session's current status

#### Scenario: User closes an ACP session

- **WHEN** the user closes an ACP session
- **THEN** the system cancels active work, uses the advertised ACP close behavior when supported, terminates the provider connection if needed, and removes the session from the active session list

#### Scenario: Provider process exits unexpectedly

- **WHEN** the ACP provider process exits or its protocol stream becomes invalid
- **THEN** the session is marked disconnected or exited, its accumulated conversation remains inspectable, and unrelated sessions continue operating

### Requirement: ACP session persistence reflects provider resumability

The system SHALL persist only the local metadata needed to identify an ACP provider session, its project, workspace, display name, and resumability state. The system SHALL NOT persist ACP authentication secrets, session tokens, provider environment secrets, or live protocol streams. After a server restart, the system SHALL attempt ACP loading or resuming only when the agent advertised the corresponding capability and shall not claim that a non-resumable session was restored.

#### Scenario: Provider supports session loading

- **WHEN** a persisted ACP session belongs to an agent that advertises session loading or resuming and the provider can authenticate
- **THEN** the system reconnects to the provider and restores the session history or continuation state using the supported ACP method

#### Scenario: Provider cannot resume a persisted session

- **WHEN** a persisted ACP session lacks a supported loading or resuming capability
- **THEN** the system marks the session as non-resumable or offers an explicit new-session action without presenting a new session as the old conversation

### Requirement: Provider and model changes do not imply conversation migration

The system SHALL treat the selected ACP provider and its model configuration as properties of an individual session. Changing the provider SHALL create or select a separate session, and the system SHALL not imply that conversation history or unsent context has transferred between Cursor, OpenCode, or another agent unless the user explicitly composes and sends that context.

#### Scenario: User switches from Cursor to OpenCode

- **WHEN** the user chooses OpenCode after viewing a Cursor session
- **THEN** the system shows or creates a separate OpenCode session and leaves the Cursor session and its history unchanged

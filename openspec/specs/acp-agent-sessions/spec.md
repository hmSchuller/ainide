# acp-agent-sessions Specification

## Purpose

Lets ainide present Cursor, OpenCode, and other configured local ACP agents through one structured web client while preserving provider-specific capabilities and safe project boundaries.

## Requirements

### Requirement: Users can start configured ACP agent sessions

The system SHALL present an in-app picker containing one entry for each configured local ACP provider and SHALL allow the user to choose only from those providers. Selecting a provider SHALL start a new session immediately for the active project without requesting a user-supplied session title or exposing a PTY fallback. The ainide server SHALL launch the configured agent process over stdio, associate the session with the active project and absolute workspace root, and expose a local session identity distinct from the provider's ACP session identifier.

#### Scenario: User starts an OpenCode session

- **WHEN** the user opens the new-agent action and selects the configured OpenCode ACP provider
- **THEN** the server immediately launches the provider's ACP command, completes the connection setup, and shows the new session in the active project's agent workbench without another title or provider prompt

#### Scenario: Only configured ACP providers are offered

- **WHEN** the configured providers are Cursor and OpenCode
- **THEN** the picker displays those providers using their configured labels and does not display an unconfigured provider, a free-form provider input, or a PTY option

#### Scenario: No ACP providers are configured

- **WHEN** the provider list is empty
- **THEN** the picker shows that no ACP providers are configured, does not create a session, and does not fall back to a PTY agent

#### Scenario: Configured ACP command is unavailable

- **WHEN** the user starts a provider whose executable or required arguments are unavailable
- **THEN** the system reports a startup error, does not create a live session, and leaves existing sessions unchanged

### Requirement: Provider-generated session titles preserve explicit user renames

The system SHALL assign a usable provisional title from the selected provider's configured label until the provider supplies a non-empty title through the ACP session metadata update. A valid provider-generated title SHALL replace the provisional title and SHALL be published to the browser and local session state. After the user explicitly renames a session, that user title SHALL remain authoritative and later provider-generated title updates SHALL NOT replace it. Empty, null, malformed, or unavailable provider titles SHALL NOT leave the session without a usable title.

#### Scenario: Provider supplies a title after session creation

- **WHEN** an ACP provider sends a valid `session_info_update` containing a title for a newly created session
- **THEN** the workbench displays the provider-generated title in place of the provisional provider label and the title is included in subsequent session snapshots

#### Scenario: Provider does not supply a title

- **WHEN** a provider creates a session but never sends a usable title update
- **THEN** the session remains visible with its provisional provider-label title and remains usable for prompting and renaming

#### Scenario: User rename takes precedence over a later provider update

- **WHEN** the user renames a session and the provider later sends a different session title
- **THEN** the workbench retains the user-selected title and does not replace it with the provider title

#### Scenario: User rename remains authoritative after restart

- **WHEN** a user-renamed ACP session is restored after an ainide restart and the provider sends a different title
- **THEN** the restored session retains the user-selected title and the provider update does not overwrite it

#### Scenario: Provider sends an unusable title

- **WHEN** a provider sends an empty, null, malformed, or otherwise invalid title update
- **THEN** the system keeps the current usable title and does not display a blank or invalid session title

### Requirement: ACP connections negotiate protocol and authentication

The system SHALL initialize each ACP connection using a supported stable protocol version and shall advertise only capabilities that ainide actually implements. The system SHALL authenticate only with an authentication method advertised by the agent and SHALL surface authentication-required or authentication-failed states without exposing provider credentials to the browser.

#### Scenario: Agent advertises an authentication method

- **WHEN** an ACP agent returns an authentication method during initialization
- **THEN** the system offers the corresponding provider login action or reports that the agent must be authenticated through its supported local flow before creating a usable session

#### Scenario: Agent omits an optional capability

- **WHEN** an ACP agent does not advertise an optional method or capability
- **THEN** the system does not call that method and presents the session with the supported subset of controls

### Requirement: Users can select advertised session configuration

The system SHALL display model and other session configuration options returned by the selected ACP agent during session setup or later configuration updates. A manual selection SHALL be scoped to the selected agent session and SHALL be sent using the ACP configuration method with the advertised option identifier and value. After the provider accepts a selection, the system SHALL persist that primitive value as the last-used preference for the selected provider. When starting a new session for that provider, the system SHALL attempt to apply compatible persisted preferences after the provider advertises its options. The system SHALL NOT invent model options when the agent does not advertise them.

#### Scenario: Agent supplies model options

- **WHEN** an ACP session returns a selectable configuration option categorized as a model
- **THEN** the session header exposes the available labels and current value, and choosing another value updates that ACP session without changing other sessions

#### Scenario: A new session reuses a provider preference

- **WHEN** a user starts a new session for a provider with a previously accepted configuration value and the new session advertises a compatible option
- **THEN** the system applies the remembered value through the provider configuration method and displays the provider-reported resulting value without changing existing sessions

#### Scenario: Preferences remain isolated by provider

- **WHEN** a user starts a new session for a different provider
- **THEN** the system does not apply configuration values remembered for another provider

#### Scenario: A remembered value is no longer advertised

- **WHEN** a new session does not advertise a previously remembered option or no longer accepts its value
- **THEN** the system leaves that option at the provider’s current default, keeps the new session usable, and does not display an invented or invalid choice

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

The system SHALL persist only the local metadata needed to identify an ACP provider session, its project, workspace, display name, title ownership, and resumability state, together with validated primitive provider-scoped configuration preferences for use by future new sessions. The system SHALL NOT persist ACP authentication secrets, session tokens, provider environment secrets, or live protocol streams. After a server restart, the system SHALL attempt ACP loading or resuming only when the agent advertised the corresponding capability and shall not claim that a non-resumable session was restored. Persisted provider preferences SHALL NOT override the configuration of an existing restored ACP conversation.

#### Scenario: Provider supports session loading

- **WHEN** a persisted ACP session belongs to an agent that advertises session loading or resuming and the provider can authenticate
- **THEN** the system reconnects to the provider and restores the session history or continuation state using the supported ACP method

#### Scenario: Provider cannot resume a persisted session

- **WHEN** a persisted ACP session lacks a supported loading or resuming capability
- **THEN** the system marks the session as non-resumable or offers an explicit new-session action without presenting a new session as the old conversation

#### Scenario: Provider preferences survive a server restart

- **WHEN** a user has successfully selected a provider configuration value, the server restarts, and the user starts a new session for that provider
- **THEN** the system loads the preference from local session state and attempts to apply it to the new provider session

#### Scenario: Restored conversation configuration is preserved

- **WHEN** a persisted ACP conversation is restored after restart and the provider reports its current session configuration
- **THEN** the system preserves the restored conversation's provider-reported configuration rather than replacing it with the last-used new-session preference

#### Scenario: Persisted title ownership is respected during restoration

- **WHEN** a persisted session records an explicit user title and the restored provider reports a different title
- **THEN** the system keeps the persisted user title and does not allow the provider update to replace it

### Requirement: Provider and model changes do not imply conversation migration

The system SHALL treat the selected ACP provider and its model configuration as properties of an individual session. Changing the provider SHALL create or select a separate session, and the system SHALL not imply that conversation history or unsent context has transferred between Cursor, OpenCode, or another agent unless the user explicitly composes and sends that context.

#### Scenario: User switches from Cursor to OpenCode

- **WHEN** the user chooses OpenCode after viewing a Cursor session
- **THEN** the system shows or creates a separate OpenCode session and leaves the Cursor session and its history unchanged

### Requirement: Provider-advertised commands are session state

The system SHALL recognize an ACP `available_commands_update` as the provider's complete current command list for that session. Each advertised command SHALL be available to the browser with its name and description and, when supplied by the provider, a hint for unstructured text input. The update SHALL update session state rather than create a conversation-history activity.

#### Scenario: Provider advertises commands during session setup

- **WHEN** an ACP provider sends `available_commands_update` after creating or restoring a session
- **THEN** the associated session exposes the advertised commands, and the conversation does not display an unknown-activity entry for that update

#### Scenario: Provider changes its available commands

- **WHEN** an ACP provider sends a later `available_commands_update`
- **THEN** the session replaces its previous command list with the newly advertised complete list, including removing commands that are no longer present

#### Scenario: Provider clears its available commands

- **WHEN** an ACP provider sends an empty `availableCommands` list
- **THEN** the session exposes no command suggestions and retains no previous advertised commands

#### Scenario: Browser reconnects to a session with commands

- **WHEN** the browser reconnects to ainide while a live session has a current advertised command list
- **THEN** the authenticated session snapshot or subsequent session state exposes that current list for the active project only

### Requirement: ACP composers provide provider command autocomplete and conventional submission keys

The system SHALL provide slash-command autocomplete in the composer for a selected ACP session using only that session's current advertised commands. Typing `/` or a partial slash command SHALL filter the available suggestions. Selecting a suggestion SHALL insert `/<command-name> ` at the caret, preserve the remaining draft text, and SHALL NOT submit the prompt. When command suggestions are not open, plain `Enter` SHALL submit a valid prompt and `Shift+Enter` SHALL insert a newline without submitting. When suggestions are open, plain `Enter` SHALL select the active suggestion and `Shift+Enter` SHALL insert a newline without submitting. `Cmd/Ctrl+Enter` SHALL remain an explicit submit alias.

#### Scenario: User discovers provider commands

- **WHEN** the user focuses an ACP composer and types `/`
- **THEN** the composer shows matching commands from the selected provider session with their descriptions and any available input hint

#### Scenario: User filters provider commands

- **WHEN** the user types additional command-name characters after `/`
- **THEN** the composer limits suggestions to commands matching the typed command prefix

#### Scenario: User selects a command

- **WHEN** the user selects an autocomplete suggestion
- **THEN** the composer inserts the command name with a leading slash and trailing space at the current command position, keeps the prompt as an unsent draft, and leaves any command arguments for the user to enter

#### Scenario: Enter selects an open suggestion

- **WHEN** autocomplete suggestions are open and the user presses plain `Enter`
- **THEN** the active suggestion is inserted, the prompt is not submitted, and the user can continue composing its arguments

#### Scenario: Enter submits ordinary text

- **WHEN** autocomplete suggestions are closed, the draft contains prompt text or attached references, and the user presses plain `Enter`
- **THEN** ainide submits the prompt and does not insert a newline

#### Scenario: Shift+Enter inserts a newline

- **WHEN** the user presses `Shift+Enter` in the ACP composer
- **THEN** the composer inserts a newline and does not submit or select an autocomplete suggestion

#### Scenario: User sends an inserted command

- **WHEN** the user submits a draft containing an inserted provider command
- **THEN** ainide sends the resulting text as the ordinary ACP prompt without adding a separate command-execution request or modifying the command list

#### Scenario: User retains an explicit modified-key submit

- **WHEN** the user presses `Cmd+Enter` or `Ctrl+Enter` with a valid ACP draft and autocomplete does not claim the key event
- **THEN** ainide submits the prompt without inserting a newline

#### Scenario: Composer has no submit-ready content

- **WHEN** the draft has neither non-whitespace text nor attached references, or the ACP session requires authentication or already has an active prompt
- **THEN** pressing a submit key does not send a prompt or clear the draft

#### Scenario: IME composition is active

- **WHEN** the user presses `Enter` while an input method editor is composing text
- **THEN** the composer does not submit the prompt and allows the composition to handle the key event

#### Scenario: Session has no advertised commands

- **WHEN** the selected ACP session has not advertised commands or has advertised an empty list
- **THEN** the composer does not show provider command suggestions and ordinary text prompting remains available

### Requirement: ACP prompt drafts clear optimistically and recover safely

When a valid ACP prompt submission begins, the system SHALL immediately clear the submitted text and attached references so the composer is ready for another prompt without waiting for the provider turn to finish. If dispatch fails before the prompt is accepted, the system SHALL restore the submitted draft only when the composer is still empty; it SHALL preserve any replacement draft entered after the optimistic clear. A failed submission SHALL remain visible through the existing error notification behavior.

#### Scenario: Draft clears when submission begins

- **WHEN** the user submits a valid ACP draft
- **THEN** the text field and its attached references clear immediately while the prompt is dispatched

#### Scenario: Failed dispatch restores an untouched draft

- **WHEN** dispatch fails after the system optimistically cleared the draft and the user has not entered replacement content
- **THEN** the original text and attached references are restored for retry

#### Scenario: Failed dispatch preserves a replacement draft

- **WHEN** dispatch fails after the system optimistically cleared the draft and the user has entered a new draft
- **THEN** the new draft remains unchanged and the failed submitted content is not merged into it

#### Scenario: Successful dispatch does not restore submitted content

- **WHEN** the submitted prompt is accepted and the user has not entered a replacement draft
- **THEN** the composer remains empty and does not restore the submitted text or references

### Requirement: Unsupported ACP updates remain inspectable

The system SHALL retain the existing safe fallback for ACP update variants that ainide does not understand. Such updates SHALL remain inspectable without being treated as completed prompts, while supported `available_commands_update` notifications SHALL not use that fallback.

#### Scenario: Provider sends an unrecognized update

- **WHEN** an ACP provider sends an update variant that is not supported by ainide, such as a future or provider-specific variant
- **THEN** the session remains connected and preserves sanitized metadata for inspection without treating the update as prompt completion

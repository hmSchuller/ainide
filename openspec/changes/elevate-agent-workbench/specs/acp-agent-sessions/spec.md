## MODIFIED Requirements

### Requirement: Users can start configured ACP agent sessions
The system SHALL offer each configured local ACP provider enabled for the active project as an execution choice inside the delegation creation flow. A configured provider disabled for the project SHALL NOT be offered. Before confirmation, the flow SHALL identify the provider and its known or discoverable capabilities, selected execution workspace, continuity support, and configuration choices. Confirming SHALL launch the provider over stdio for the selected delegation workspace and associate its local session identity with the delegation independently from the provider's ACP session identifier.

#### Scenario: User starts an OpenCode execution
- **WHEN** the user defines a delegation, selects configured OpenCode, reviews its workspace and capabilities, and confirms
- **THEN** the server launches the provider in that workspace and shows the execution inside the delegation

#### Scenario: User starts an OpenCode session
- **WHEN** the user defines a delegation and confirms the configured OpenCode ACP provider as its execution
- **THEN** the server launches the provider, completes connection setup, and shows the session inside the active project's delegation

#### Scenario: Only enabled providers are offered
- **WHEN** configured providers include one disabled for the active project
- **THEN** the creation flow excludes the disabled provider while leaving eligible ACP providers and the configured PTY choice available

#### Scenario: Only configured ACP providers are offered
- **WHEN** the configured ACP providers are Cursor and OpenCode
- **THEN** the ACP execution choices show Cursor and OpenCode and do not offer an unconfigured provider or free-form provider command

#### Scenario: Project-disabled providers are not offered
- **WHEN** Cursor, OpenCode, and Gemini are configured and Gemini is disabled for the active project
- **THEN** the ACP execution choices show Cursor and OpenCode and exclude Gemini

#### Scenario: No ACP providers are configured
- **WHEN** the provider list is empty
- **THEN** the flow explains how local ACP providers are configured and continues to offer a configured PTY agent without silently creating either transport

#### Scenario: All configured providers are disabled for the project
- **WHEN** every configured ACP provider is disabled for the active project
- **THEN** the flow reports that no ACP providers are available, creates no ACP execution, and continues to offer a configured PTY agent independently

#### Scenario: Configured ACP command is unavailable
- **WHEN** the user confirms a provider whose executable or required arguments are unavailable
- **THEN** the system reports an actionable startup error, records the failed execution attempt, and leaves the delegation available for retry or another execution choice

### Requirement: Users can send prompts and receive structured session updates
The system SHALL let the user send a text prompt with optional supported context to a selected ACP execution and SHALL preserve updates in arrival order. It SHALL group supported activity by prompt turn and present the user request, current action, blocking requests, final response, and source-labelled evidence before the collapsible raw activity timeline. Safe Markdown and unsafe-content protections SHALL apply to both narrative and raw views, and unknown updates SHALL remain inspectable without becoming inferred evidence.

#### Scenario: Agent streams a tool-assisted response
- **WHEN** a prompt produces messages, thoughts, tool calls, file locations, terminal output, and completion
- **THEN** the session updates one turn narrative, summarizes supported evidence with its source, and retains the ordered underlying events for inspection

#### Scenario: User message contains Markdown
- **WHEN** the user submits a prompt containing supported Markdown
- **THEN** the turn narrative renders its structure safely while ACP receives and history retains the original source text

#### Scenario: Agent message contains Markdown
- **WHEN** an agent message contains supported Markdown structure
- **THEN** the turn narrative and raw activity present that structure without exposing source text as the only rendering

#### Scenario: Markdown arrives in streamed chunks
- **WHEN** streamed chunks extend an incomplete Markdown message
- **THEN** the accumulated source is safely reparsed in place without losing order or splitting it into unrelated messages

#### Scenario: Turn is still active
- **WHEN** the provider is processing a prompt
- **THEN** the session keeps the current deterministic action and elapsed state visible without theatrical or inferred progress

#### Scenario: Agent reports a file location
- **WHEN** an ACP update identifies a workspace file or diff
- **THEN** the user can open a visibly active Edit or delegation-review surface and return to the originating turn

#### Scenario: Agent reports a file change
- **WHEN** an ACP update includes a file location or diff for a workspace file
- **THEN** the evidence preserves its provider source, the user can inspect it visibly, and ordinary workspace change detection remains active

#### Scenario: Message contains unsafe content
- **WHEN** a message contains raw HTML or an unsafe URL scheme
- **THEN** neither the turn narrative nor raw activity view executes the markup or activates the unsafe link

#### Scenario: Message contains unsafe markup or a URL
- **WHEN** a user or agent message contains raw HTML or a link using an unsafe scheme
- **THEN** the session does not execute the HTML or create an active unsafe link in either narrative or raw views

#### Scenario: Unknown update content is received
- **WHEN** the provider sends an unsupported update variant
- **THEN** the session stays usable, retains sanitized inspection data, and does not classify the update as completion or verified evidence

### Requirement: Users can respond to ACP permission and elicitation requests
The system SHALL present pending permission and supported structured-input requests as blocking turn decisions and global attention. It SHALL identify the provider, delegation, requested operation or question, available option scope when advertised, and relevant context; SHALL never auto-approve; and SHALL retain a safe local decision record. Cancellation SHALL resolve pending requests as cancelled or rejected according to protocol.

#### Scenario: Agent requests permission
- **WHEN** an ACP execution requests permission with provider-defined options
- **THEN** the owning turn and global attention identify the blocked delegation and distinguish option scope before returning only the user's explicit selection

#### Scenario: Agent requests permission to execute a command
- **WHEN** an ACP agent requests permission to execute a command and supplies multiple options
- **THEN** the decision surface shows the operation and option scope and returns only the option explicitly selected by the user

#### Scenario: User cancels while permission is pending
- **WHEN** the user cancels the active prompt while a request awaits a decision
- **THEN** the request is resolved as cancelled or rejected, attention clears, and the decision outcome remains in the evidence record

### Requirement: ACP composers adapt to execution state
The ACP composer SHALL expose discoverable prompt, `@` context, slash-command, newline, and submit behavior. While a turn is active, it SHALL let the user draft or queue a follow-up without misrepresenting it as sent. Authentication, blocking requests, exited state, and review-ready state SHALL present appropriate recovery or continuation actions.

#### Scenario: User drafts while work is active
- **WHEN** an ACP execution is processing and the user writes a follow-up
- **THEN** the content remains visibly unsent or queued according to the user's explicit action and is not dispatched concurrently by accident

### Requirement: ACP context transitions are explicit lifecycle actions
Starting a fresh ACP context, loading a recent provider conversation, reconnecting to a live execution, and closing an execution SHALL be distinct actions. Fresh-context rollover SHALL state what local delegation data remains, what transcript becomes historical, and how the prior provider conversation can be reopened when supported.

#### Scenario: User starts a fresh context
- **WHEN** the user confirms fresh-context rollover for an idle ACP execution
- **THEN** the delegation remains, the previous execution becomes historical, the new provider context is identified as fresh, and unavailable recovery behavior is disclosed before the transition

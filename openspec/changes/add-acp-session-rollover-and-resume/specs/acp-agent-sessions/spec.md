# acp-agent-sessions Delta

## ADDED Requirements

### Requirement: ACP sessions can roll over to a fresh provider context

The system SHALL allow the user to roll a live ACP session over to a fresh provider context without closing the ainide session. Rollover SHALL keep the same local session record, the same workbench slot, and the existing provider process, SHALL create a new provider session on the same ACP connection, and SHALL release the previous provider session without deleting it so it remains available for resumption through the provider. The previous provider session SHALL be closed through the ACP close method only when the agent advertises close support, and a close failure SHALL NOT prevent the fresh context from starting. The rolled-over session SHALL start with an empty visible transcript and an empty composer draft, SHALL take its configuration options from the new provider session, SHALL re-apply remembered provider preferences, SHALL keep an explicit user-set title while reverting a provider-derived title to the provider label, and SHALL persist its descriptor with the new provider session identifier. Rollover SHALL be rejected with an actionable error while a prompt is active, and SHALL be rejected when the session is not live or requires authentication.

#### Scenario: User rolls a session over

- **WHEN** the user selects the `/new` client command in a live ACP session that has no active prompt
- **THEN** the same workbench card remains with the same local session identity and provider process, the conversation shows a fresh empty context bound to a new provider session, and the composer is empty and ready

#### Scenario: Rolled-over context is not destroyed

- **WHEN** a session is rolled over and the provider retains its session store
- **THEN** the previous provider conversation is not deleted by ainide and later appears in that provider's recent sessions available for resumption

#### Scenario: Rollover rejected while a prompt is active

- **WHEN** the user selects `/new` while the session has an active prompt
- **THEN** the system reports that the active prompt must be cancelled first, the session keeps its current provider session and transcript, and no new provider session is created

#### Scenario: Rollover on a session that requires authentication

- **WHEN** the user selects `/new` while the session is in an authentication-required state
- **THEN** the system reports that the provider must be authenticated first and the session state is unchanged

#### Scenario: Rollover without advertised close support

- **WHEN** the agent does not advertise ACP close support and the session is rolled over
- **THEN** the system does not call the close method, the previous provider session is abandoned rather than deleted, and the fresh context starts normally

#### Scenario: Rollover preserves title ownership

- **WHEN** a session with an explicit user title is rolled over
- **THEN** the rolled-over session keeps the user title, while a session whose title came from the provider reverts to the provider label and may later receive a new provider-generated title

#### Scenario: Rollover re-applies remembered preferences

- **WHEN** a session is rolled over and the new provider session advertises a configuration option for which the provider has a remembered value
- **THEN** the system applies the remembered value to the new provider session without changing any other session

### Requirement: Recent provider sessions can be resumed from the new-agent picker

The system SHALL start a provider and load a selected recent provider session when the user picks it from the new-agent picker. The recent session list for a provider SHALL contain only sessions whose workspace matches the active project's workspace, SHALL be bounded in count and ordered by most recent first, and SHALL treat provider-supplied titles and timestamps as untrusted display text. Selecting a recent session SHALL create an ainide session for the active project whose provider connection is loaded with the selected provider session identifier instead of creating a new provider session, and the provider's replayed transcript for that session SHALL be rendered through the ordinary session update pipeline. When the selected provider session is already represented by a live ainide session for the same provider, the system SHALL focus that existing session instead of starting another provider process. A failed session load SHALL be reported explicitly and SHALL NOT be presented as a restored or live session. A successfully resumed session SHALL be persisted with its provider session identifier so standard restart restoration applies.

#### Scenario: User resumes a recent session

- **WHEN** the user selects a recent OpenCode session from the new-agent picker
- **THEN** the server starts the OpenCode provider, loads that provider session, the workbench shows the session with its provider-supplied title, and the provider's replayed past transcript is rendered in the session history

#### Scenario: Selecting an already-live session focuses it

- **WHEN** the user selects a recent session whose provider session identifier is already bound to a live ainide session
- **THEN** the system focuses the existing session without starting another provider process or creating a duplicate workbench entry

#### Scenario: Session load fails

- **WHEN** the provider rejects or cannot complete the load of a selected session
- **THEN** the system reports the failure, does not present the session as restored, and leaves existing sessions unchanged

#### Scenario: Resumed session survives restart

- **WHEN** a resumed session is persisted and the server restarts
- **THEN** the standard restoration behavior attempts to load the recorded provider session and does not claim restoration when the provider cannot load it

#### Scenario: Sessions from other workspaces are not offered

- **WHEN** the provider's session list contains sessions for workspaces other than the active project
- **THEN** the picker does not offer those sessions for the active project

## MODIFIED Requirements

### Requirement: Users can start configured ACP agent sessions

The system SHALL present an in-app picker containing, for each configured local ACP provider that is enabled for the active project, an entry to start a new session and, when the provider advertises ACP session listing, that provider's recent sessions for the active workspace with their provider titles and recency, bounded in count and ordered by most recent first. A configured provider that is disabled for the active project SHALL NOT be offered in the picker. Selecting a new-session entry SHALL start a new session immediately for the active project without requesting a user-supplied session title or exposing a PTY fallback. Selecting a recent session entry SHALL start the corresponding provider and request loading of the selected provider session. The ainide server SHALL launch the configured agent process over stdio, associate the session with the active project and absolute workspace root, and expose a local session identity distinct from the provider's ACP session identifier.

#### Scenario: User starts an OpenCode session

- **WHEN** the user opens the new-agent action and selects the configured OpenCode ACP provider
- **THEN** the server immediately launches the provider's ACP command, completes the connection setup, and shows the new session in the active project's agent workbench without another title or provider prompt

#### Scenario: Only configured ACP providers are offered

- **WHEN** the configured providers are Cursor and OpenCode
- **THEN** the picker displays those providers using their configured labels and does not display an unconfigured provider, a free-form provider input, or a PTY option

#### Scenario: Project-disabled providers are not offered

- **WHEN** the configured providers are Cursor, OpenCode, and Gemini, and Gemini is disabled for the active project
- **THEN** the picker displays Cursor and OpenCode and does not display Gemini

#### Scenario: Picker shows recent sessions for listing providers

- **WHEN** the user opens the new-agent action and a configured provider advertises ACP session listing
- **THEN** the picker shows that provider's recent sessions for the active workspace with provider titles and recency, most recent first, alongside its start-new entry

#### Scenario: Provider has no resumable sessions

- **WHEN** a configured provider that advertises ACP session listing returns no sessions for the active workspace
- **THEN** the picker shows a muted empty state for that provider's recent sessions and continues to offer its start-new entry

#### Scenario: Recent session lookup is bounded

- **WHEN** a provider's session listing is slow to answer or times out
- **THEN** the picker shows that resuming is unavailable for that provider, offers its start-new entry, and does not block the rest of the picker

#### Scenario: No ACP providers are configured

- **WHEN** the provider list is empty
- **THEN** the picker shows that no ACP providers are configured, does not create a session, and does not fall back to a PTY agent

#### Scenario: All configured providers are disabled for the project

- **WHEN** every configured provider is disabled for the active project
- **THEN** the picker shows that no ACP providers are available for the project, does not create a session, and does not fall back to a PTY agent

#### Scenario: Configured ACP command is unavailable

- **WHEN** the user starts a provider whose executable or required arguments are unavailable
- **THEN** the system reports a startup error, does not create a live session, and leaves existing sessions unchanged

### Requirement: ACP composers provide provider command autocomplete and conventional submission keys

The system SHALL provide slash-command autocomplete in the composer for a selected ACP session using that session's current advertised provider commands together with a fixed set of client session commands that are visually distinguished from provider commands. Typing `/` or a partial slash command SHALL filter the available suggestions. Selecting a provider command suggestion SHALL insert `/<command-name> ` at the caret, preserve the remaining draft text, and SHALL NOT submit the prompt. Selecting a client command suggestion SHALL execute the command immediately without inserting command text into the draft. When command suggestions are not open, plain `Enter` SHALL submit a valid prompt and `Shift+Enter` SHALL insert a newline without submitting. When suggestions are open, plain `Enter` SHALL select the active suggestion and `Shift+Enter` SHALL insert a newline without submitting. `Cmd/Ctrl+Enter` SHALL remain an explicit submit alias.

#### Scenario: User discovers provider commands

- **WHEN** the user focuses an ACP composer and types `/`
- **THEN** the composer shows matching commands from the selected provider session with their descriptions and any available input hint

#### Scenario: User discovers client session commands

- **WHEN** the user focuses an ACP composer and types `/`
- **THEN** the composer also shows the client session commands, visually distinguished from provider commands, alongside matching provider commands

#### Scenario: User filters provider commands

- **WHEN** the user types additional command-name characters after `/`
- **THEN** the composer limits suggestions to commands matching the typed command prefix

#### Scenario: User selects a command

- **WHEN** the user selects a provider command autocomplete suggestion
- **THEN** the composer inserts the command name with a leading slash and trailing space at the current command position, keeps the prompt as an unsent draft, and leaves any command arguments for the user to enter

#### Scenario: User selects the new-context client command

- **WHEN** the user selects the `/new` client command suggestion
- **THEN** the composer clears the draft and executes the session rollover without inserting command text or submitting a prompt

#### Scenario: Enter selects an open suggestion

- **WHEN** autocomplete suggestions are open and the user presses plain `Enter`
- **THEN** the active suggestion is selected, a provider command is inserted without submitting, and a client command is executed without submitting

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
- **THEN** the composer does not show provider command suggestions, continues to show client session commands, and ordinary text prompting remains available

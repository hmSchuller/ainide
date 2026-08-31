## ADDED Requirements

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

### Requirement: ACP composers provide provider command autocomplete

The system SHALL provide slash-command autocomplete in the composer for a selected ACP session using only that session's current advertised commands. Typing `/` or a partial slash command SHALL filter the available suggestions. Selecting a suggestion SHALL insert `/<command-name> ` at the caret, preserve the remaining draft text, and SHALL NOT submit the prompt.

#### Scenario: User discovers provider commands

- **WHEN** the user focuses an ACP composer and types `/`
- **THEN** the composer shows matching commands from the selected provider session with their descriptions and any available input hint

#### Scenario: User filters provider commands

- **WHEN** the user types additional command-name characters after `/`
- **THEN** the composer limits suggestions to commands matching the typed command prefix

#### Scenario: User selects a command

- **WHEN** the user selects an autocomplete suggestion
- **THEN** the composer inserts the command name with a leading slash and trailing space at the current command position, keeps the prompt as an unsent draft, and leaves any command arguments for the user to enter

#### Scenario: User sends an inserted command

- **WHEN** the user submits a draft containing an inserted provider command
- **THEN** ainide sends the resulting text as the ordinary ACP prompt without adding a separate command-execution request or modifying the command list

#### Scenario: Session has no advertised commands

- **WHEN** the selected ACP session has not advertised commands or has advertised an empty list
- **THEN** the composer does not show provider command suggestions and ordinary text prompting remains available

### Requirement: Unsupported ACP updates remain inspectable

The system SHALL retain the existing safe fallback for ACP update variants that ainide does not understand. Such updates SHALL remain inspectable without being treated as completed prompts, while supported `available_commands_update` notifications SHALL not use that fallback.

#### Scenario: Provider sends an unrecognized update

- **WHEN** an ACP provider sends an update variant that is not supported by ainide, such as a future or provider-specific variant
- **THEN** the session remains connected and preserves sanitized metadata for inspection without treating the update as prompt completion

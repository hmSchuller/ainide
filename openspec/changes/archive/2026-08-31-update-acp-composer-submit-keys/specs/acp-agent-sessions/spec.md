## MODIFIED Requirements

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

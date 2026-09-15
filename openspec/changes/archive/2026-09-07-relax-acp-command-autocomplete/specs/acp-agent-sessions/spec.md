## MODIFIED Requirements

### Requirement: ACP composers provide provider command autocomplete and conventional submission keys

The system SHALL provide slash-command autocomplete in the composer for a selected ACP session using only that session's current advertised commands. Typing `/` or a partial slash command SHALL filter the available suggestions using ranked, segment-aware matching. When the typed query is non-empty, suggestions SHALL be limited to commands whose name matches by full-name prefix, hyphen-segment prefix, segment substring, or (for queries of at least four characters) in-order subsequence within a hyphen segment. Suggestions SHALL be ordered by match quality, with stronger matches appearing before weaker ones, and ties broken deterministically by command name. Selecting a suggestion SHALL insert `/<command-name> ` at the caret, preserve the remaining draft text, and SHALL NOT submit the prompt. When command suggestions are not open, plain `Enter` SHALL submit a valid prompt and `Shift+Enter` SHALL insert a newline without submitting. When suggestions are open, plain `Enter` SHALL select the active suggestion and `Shift+Enter` SHALL insert a newline without submitting. `Cmd/Ctrl+Enter` SHALL remain an explicit submit alias.

#### Scenario: User discovers provider commands

- **WHEN** the user focuses an ACP composer and types `/`
- **THEN** the composer shows matching commands from the selected provider session with their descriptions and any available input hint

#### Scenario: User filters provider commands

- **WHEN** the user types additional command-name characters after `/` that match the start of one or more command names
- **THEN** the composer limits suggestions to those commands and ranks exact and prefix matches ahead of weaker matches

#### Scenario: User filters namespaced commands by action segment

- **WHEN** the user types a partial query after `/` that matches a hyphen segment but not the full command-name prefix, such as `/apply` against `opsx-apply`
- **THEN** the composer includes that command in the suggestions

#### Scenario: User filters commands by partial segment text

- **WHEN** the user types a partial query after `/` of at least three characters that appears inside a hyphen segment, such as `/plore` against `opsx-explore`
- **THEN** the composer includes that command in the suggestions ahead of unrelated commands

#### Scenario: User filters commands with a typo-tolerant partial

- **WHEN** the user types a partial query after `/` of at least four characters that matches an in-order subsequence within a hyphen segment, such as `/opose` against `opsx-propose`
- **THEN** the composer includes that command in the suggestions

#### Scenario: Short partial queries stay conservative

- **WHEN** the user types one or two characters after `/`
- **THEN** the composer limits suggestions to full-name prefix and hyphen-segment prefix matches only

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

## ADDED Requirements

### Requirement: ACP composers provide active-workspace @ file autocomplete

The system SHALL provide file autocomplete in an ACP composer in addition to provider slash-command autocomplete. An `@` token at the start of a prompt or after whitespace SHALL be eligible for matching at the caret. File suggestions SHALL be scoped to the active workspace, and selecting a suggestion SHALL preserve surrounding draft text, insert the workspace-relative path with an `@` prefix, and leave the prompt unsent.

#### Scenario: User opens file suggestions

- **WHEN** the user types `@` followed by a partial file path in an ACP composer
- **THEN** the composer displays matching active-workspace files and distinguishes file suggestions from provider slash commands

#### Scenario: User selects a file suggestion with the keyboard

- **WHEN** file suggestions are open and the user presses plain `Enter` or `Tab`
- **THEN** the active file suggestion is inserted at the caret, its whole-file context is attached to the draft, and no ACP prompt is sent

#### Scenario: User dismisses file suggestions

- **WHEN** file suggestions are open and the user presses `Escape`
- **THEN** the suggestions close without changing the draft or attaching a file

#### Scenario: User continues a multiline prompt

- **WHEN** file suggestions are open and the user presses `Shift+Enter`
- **THEN** a newline is inserted without selecting a file or submitting the prompt

#### Scenario: Existing slash commands remain available

- **WHEN** the user types a slash command or submits a composer draft without an active file suggestion
- **THEN** the existing provider-command autocomplete and conventional submission behavior continue unchanged

#### Scenario: File context is sent only with the prompt

- **WHEN** the user submits a draft containing one or more selected `@` files
- **THEN** the ACP request contains the draft text and selected file context, and selecting the files earlier did not call the ACP prompt operation

#### Scenario: File search returns no match

- **WHEN** the user types an `@` query that matches no active-workspace file
- **THEN** the composer shows no selectable file and ordinary draft editing remains usable

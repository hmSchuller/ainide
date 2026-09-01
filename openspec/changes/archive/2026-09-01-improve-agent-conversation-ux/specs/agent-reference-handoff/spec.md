## ADDED Requirements

### Requirement: Users can reference workspace files from an ACP draft with @

The system SHALL let a user type `@` followed by a workspace path in an ACP composer and choose a matching file from the active project's autocomplete results. Selecting a file SHALL attach a whole-file reference containing the current disk content and workspace-relative path to the unsent ACP draft. The operation SHALL ignore unsaved editor-buffer content, SHALL not mutate the shared reference kit, and SHALL not send an ACP prompt.

#### Scenario: User discovers files with an @ prefix

- **WHEN** the user types `@` or a partial workspace path at the caret in an ACP composer
- **THEN** the composer shows matching files from the active project and does not include files from hidden projects

#### Scenario: User selects a file reference

- **WHEN** the user selects `src/app.ts` from the `@` file suggestions
- **THEN** the draft retains a visible `@src/app.ts` mention, contains the file as an attached whole-file context item, and remains unsent

#### Scenario: File reference uses disk content

- **WHEN** `src/app.ts` is open with unsaved editor changes and the user selects it from `@` suggestions
- **THEN** the attached reference contains the current disk version rather than the unsaved editor buffer

#### Scenario: User removes an attached @ reference

- **WHEN** the user removes an attached file reference from the ACP draft
- **THEN** that file is no longer included in the draft context and the draft makes the removal clear without changing the shared reference kit

#### Scenario: A file cannot be read as text

- **WHEN** the selected file is binary, missing, or unreadable
- **THEN** the system reports the failure, does not attach file content, and does not silently send a path-only file reference

#### Scenario: File content is transmitted only on explicit submission

- **WHEN** an ACP draft contains an `@` file reference and the user has not submitted the draft
- **THEN** the file content remains an unsent local draft attachment and is not transmitted to the ACP provider

### Requirement: @ file references remain distinct from the shared reference kit

The system SHALL keep file references selected in an ACP draft scoped to that draft. Adding, removing, submitting, or clearing an `@` reference SHALL NOT add to, remove from, or clear the active project's shared reference kit.

#### Scenario: Selecting an @ file does not populate the kit

- **WHEN** the user selects a file from ACP `@` autocomplete while the shared reference kit is empty
- **THEN** the ACP draft contains the file attachment and the shared reference kit remains empty

#### Scenario: Submitting an @ file does not consume the kit

- **WHEN** the user submits a draft containing an `@` file and separate shared-kit references
- **THEN** the prompt receives the selected draft context, the shared-kit references remain available according to existing kit behavior, and no background synchronization occurs

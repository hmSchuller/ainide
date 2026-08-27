## Purpose

Lets users turn code they are reading into precise, reusable context and hand it to a chosen local agent without losing file provenance or accidentally submitting terminal input.

## ADDED Requirements

### Requirement: Users can copy selected lines or whole files as references

The system SHALL provide a reference action for the current code selection and a separate action for the complete current file. A selected-line reference SHALL include the workspace-relative path, inclusive line range, and the selected content.

#### Scenario: User copies selected lines

- **WHEN** the user selects lines 42 through 67 in a text file and chooses Copy as reference
- **THEN** the clipboard contains a plain-text reference identifying the file and `42-67` line range followed by the selected content

#### Scenario: User copies a whole file

- **WHEN** the user chooses Copy file as reference for a text file
- **THEN** the clipboard contains a plain-text reference identifying the workspace-relative file and its complete content

#### Scenario: User references the visible buffer

- **WHEN** the visible text buffer differs from the version on disk and the user adds a selection to a reference
- **THEN** the reference captures the content currently visible in the code surface and does not save that buffer as a side effect

#### Scenario: Binary or unavailable file cannot become text reference

- **WHEN** the user requests a text reference for a binary or unreadable file
- **THEN** the system declines the operation and reports that the file cannot be copied as text

### Requirement: Users can build a per-project reference kit

The system SHALL let users add selected ranges and whole files to a reference kit containing multiple references from the active project. The kit SHALL display each item's path and line range or whole-file scope and SHALL support removing individual items and clearing the kit.

#### Scenario: User combines references from several files

- **WHEN** the user adds a selected range from one file and a whole file from another
- **THEN** the reference kit lists both items in a stable order without replacing either item

#### Scenario: User removes one reference

- **WHEN** the user removes an item from a kit containing multiple references
- **THEN** only that item is removed and the remaining references stay available for copying or handoff

#### Scenario: Reference kits follow project context

- **WHEN** the user switches projects and later switches back during the same browser session
- **THEN** each project shows its own reference kit and references from one project are not silently mixed into another

### Requirement: References have agent-ready serialization

The system SHALL serialize a single reference and a reference kit as plain text that preserves file paths, line scope, and content boundaries. Copying a reference or kit SHALL leave the source files and editor buffers unchanged, and copying SHALL be repeatable without consuming the kit.

#### Scenario: User copies a kit repeatedly

- **WHEN** the user copies the same reference kit more than once
- **THEN** each copy contains the same ordered references and the kit remains available

#### Scenario: Reference boundaries are preserved

- **WHEN** a kit contains references from multiple files
- **THEN** the copied text separates each item and identifies which content belongs to which path and line scope

### Requirement: Users can hand references to a selected agent

The system SHALL allow the user to choose a live agent session for the active project as a handoff target from the code surface or Agents workbench. Handoff SHALL insert the selected reference or kit into that agent's terminal input without automatically submitting a prompt, command, or newline.

#### Scenario: User inserts a kit into the planning agent

- **WHEN** the user selects the Plan next task agent and chooses Paste reference kit
- **THEN** the kit text is inserted into that agent session and the agent is not submitted automatically

#### Scenario: User targets a different agent

- **WHEN** the user changes the handoff target from the planning agent to the implementation agent
- **THEN** the next handoff is inserted into the implementation agent and does not alter the planning agent

#### Scenario: No live target is available

- **WHEN** the user attempts a direct handoff without a live agent target
- **THEN** the system reports that no live agent is available and keeps the reference available for ordinary clipboard copying

### Requirement: Reference handoff is available without leaving the code surface

The system SHALL expose compact reference-kit and agent-target controls from the code-reading surface so the user can mark or copy context without first switching to Agents mode. The full Agents workbench SHALL remain available for session supervision.

#### Scenario: User hands off while reading

- **WHEN** the user selects code in the Edit surface and adds it to the kit
- **THEN** the user can copy or hand off that kit from the code surface without losing the current file and selection context

### Requirement: Reference data remains local and transient

The system SHALL keep reference-kit contents in the browser session and SHALL NOT write them into the disk-backed project session snapshot or transmit them to a cloud service. A browser reload MAY clear the reference kits.

#### Scenario: Browser reload clears transient kits

- **WHEN** the browser reloads after a user has built a reference kit
- **THEN** the kit is not reconstructed from the server session snapshot and no reference content is restored as persisted session data

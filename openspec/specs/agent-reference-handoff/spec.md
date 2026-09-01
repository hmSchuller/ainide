# agent-reference-handoff Specification

## Purpose

Lets users turn code they are reading into precise, reusable context and hand it to a chosen local agent without losing file provenance or accidentally submitting terminal input.

## Requirements

### Requirement: Users can copy selected lines or whole files as references

The system SHALL provide a reference action for the current code selection and a separate action for the complete current file. A selected-line reference SHALL include the workspace-relative path, inclusive line range, and the selected content. These actions SHALL be available from the editor context menu rather than persistent editor-toolbar buttons.

#### Scenario: User copies selected lines

- **WHEN** the user selects lines 42 through 67 in a text file and chooses Copy as reference from the editor context menu
- **THEN** the clipboard contains a plain-text reference identifying the file and `42-67` line range followed by the selected content

#### Scenario: User copies a whole file

- **WHEN** the user chooses Copy file as reference from the editor context menu for a text file
- **THEN** the clipboard contains a plain-text reference identifying the workspace-relative file and its complete content

#### Scenario: User references the visible buffer

- **WHEN** the visible text buffer differs from the version on disk and the user adds a selection to a reference
- **THEN** the reference captures the content currently visible in the code surface and does not save that buffer as a side effect

#### Scenario: Binary or unavailable file cannot become text reference

- **WHEN** the user requests a text reference for a binary or unreadable file
- **THEN** the system declines the operation and reports that the file cannot be copied as text

#### Scenario: Selection actions require a selection

- **WHEN** the editor context menu is opened with no non-empty selection
- **THEN** selection-based reference actions are disabled or omitted

### Requirement: Users can build a per-project reference kit

The system SHALL let users add selected ranges and whole files to a reference kit containing multiple references from the active project. The kit SHALL display each item's path and line range or whole-file scope and SHALL support removing individual items and clearing the kit. Add-to-kit actions SHALL be available from the editor and explorer context menus rather than persistent toolbar or inline tree controls.

#### Scenario: User combines references from several files

- **WHEN** the user adds a selected range from one file and a whole file from another
- **THEN** the reference kit lists both items in a stable order without replacing either item

#### Scenario: User removes one reference

- **WHEN** the user removes an item from a kit containing multiple references
- **THEN** only that item is removed and the remaining references stay available for copying or handoff

#### Scenario: Reference kits follow project context

- **WHEN** the user switches projects and later switches back during the same browser session
- **THEN** each project shows its own reference kit and references from one project are not silently mixed into another

#### Scenario: Add file to kit from explorer context menu

- **WHEN** the user chooses Add to reference kit on a file row in the explorer context menu
- **THEN** the whole file is added to the active project's reference kit

### Requirement: References have agent-ready serialization

The system SHALL serialize a single reference and a reference kit as plain text that preserves file paths, line scope, and content boundaries. Copying a reference or kit SHALL leave the source files and editor buffers unchanged, and copying SHALL be repeatable without consuming the kit.

#### Scenario: User copies a kit repeatedly

- **WHEN** the user copies the same reference kit more than once
- **THEN** each copy contains the same ordered references and the kit remains available

#### Scenario: Reference boundaries are preserved

- **WHEN** a kit contains references from multiple files
- **THEN** the copied text separates each item and identifies which content belongs to which path and line scope

### Requirement: Users can hand references to a selected agent

The system SHALL allow the user to choose a live PTY or ACP agent session for the active project as a handoff target. For a PTY session, handoff SHALL insert the selected reference or kit into that agent's terminal input without automatically submitting a prompt, command, or newline. For an ACP session, handoff SHALL add the selected context to that session's prompt composer or unsent prompt draft without automatically sending `session/prompt`.

#### Scenario: User inserts a kit into a PTY agent

- **WHEN** the user selects a live PTY agent and chooses Paste reference kit
- **THEN** the kit text is inserted into that agent session and the agent is not submitted automatically

#### Scenario: User inserts a kit into the planning agent

- **WHEN** the user selects the Plan next task agent and chooses Paste reference kit
- **THEN** the kit text is inserted into that agent session and the agent is not submitted automatically

#### Scenario: User drafts a kit for an ACP agent

- **WHEN** the user selects a live ACP agent and chooses Add reference kit to prompt
- **THEN** the session's prompt draft contains the references with their path and line provenance and no ACP prompt is sent

#### Scenario: User targets a different agent

- **WHEN** the user changes the handoff target from the planning agent to the implementation agent
- **THEN** the next handoff is inserted into the implementation agent and does not alter the planning agent

#### Scenario: No live target is available

- **WHEN** the user attempts a direct handoff without a live agent target
- **THEN** the system reports that no live agent is available and keeps the reference available for ordinary clipboard copying

### Requirement: Reference handoff is available without leaving the code surface

The system SHALL expose compact reference-kit and agent-target controls from the code-reading surface so the user can mark or copy context without first switching to Agents mode. The reference kit dock SHALL appear only when the kit contains at least one item. The full Agents workbench SHALL remain available for session supervision.

#### Scenario: User hands off while reading

- **WHEN** the user selects code in the Edit surface and adds it to the kit
- **THEN** the user can copy or hand off that kit from the code surface without losing the current file and selection context

#### Scenario: Empty kit hides the dock

- **WHEN** the reference kit contains no items
- **THEN** the reference kit dock is not shown on the Edit surface

#### Scenario: First added item reveals the dock

- **WHEN** the user adds the first reference to an empty kit
- **THEN** the reference kit dock appears with the new item and handoff controls

#### Scenario: Clearing the kit hides the dock

- **WHEN** the user clears the last item from the reference kit
- **THEN** the reference kit dock is hidden again

### Requirement: Reference data remains local and transient

The system SHALL keep reference-kit contents in the browser session and SHALL NOT write them into the disk-backed project session snapshot or transmit them to a provider without an explicit user copy or handoff action. An explicit ACP handoff or submitted prompt MAY transmit selected reference content through the chosen agent and its provider, and the UI SHALL not represent that transmission as a background reference-kit sync. A browser reload MAY clear the reference kits.

#### Scenario: Browser reload clears transient kits

- **WHEN** the browser reloads after a user has built a reference kit
- **THEN** the kit is not reconstructed from the server session snapshot and no reference content is restored as persisted session data

#### Scenario: User explicitly sends ACP context

- **WHEN** the user submits an ACP prompt containing references from the kit
- **THEN** the selected content is sent only as part of that explicit prompt action and the kit itself remains transient in the browser

### Requirement: ACP reference context preserves visible buffer provenance

When an ACP prompt draft includes a reference captured from a dirty editor buffer, the system SHALL use the visible buffer content and SHALL retain the workspace-relative path and inclusive line scope in the rendered draft or supported ACP content representation without saving the buffer as a side effect.

#### Scenario: User drafts unsaved selected code for ACP

- **WHEN** the user selects lines from a dirty Monaco buffer and adds them to an ACP prompt draft
- **THEN** the draft contains the currently visible lines and identifies their file path and line range without changing the file on disk

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

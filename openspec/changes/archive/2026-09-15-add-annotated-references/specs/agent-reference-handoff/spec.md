## ADDED Requirements

### Requirement: Users can annotate references at capture time

The system SHALL open an annotation step before adding a selection or whole file to the reference kit. The step SHALL show the workspace-relative path and line scope or whole-file scope, SHALL provide an optional comment field, and SHALL let the user confirm or cancel. Cancelling SHALL not add a reference. Confirming with an empty comment SHALL add a reference without a comment. Copy-as-reference actions SHALL continue to copy immediately without the annotation step.

#### Scenario: User adds a selection with a comment

- **WHEN** the user selects lines 42 through 48 in a text file, chooses Add selection to kit, enters "Fix the null check", and confirms
- **THEN** the reference kit contains an item for `42-48` with that comment and the selected visible content

#### Scenario: User skips the comment

- **WHEN** the user adds a selection to the kit and confirms with an empty comment field
- **THEN** the reference kit contains the item without a comment

#### Scenario: User cancels annotation

- **WHEN** the user starts adding a reference to the kit and cancels the annotation step
- **THEN** no reference is added to the kit

#### Scenario: Copy as reference stays immediate

- **WHEN** the user chooses Copy as reference or Copy file as reference
- **THEN** the clipboard receives the serialized reference without opening the annotation step

#### Scenario: Explorer add-to-kit uses the annotation step

- **WHEN** the user chooses Add to reference kit on an explorer file row and confirms with the comment "Context for the refactor"
- **THEN** the kit contains a whole-file item with that comment

### Requirement: Users can edit reference comments in the kit

The reference kit SHALL display each item's optional comment and SHALL let the user edit that comment after capture without re-reading the file or changing the captured code snapshot.

#### Scenario: User edits a comment in the dock

- **WHEN** the user changes an item's comment in the reference kit dock
- **THEN** subsequent copy and handoff operations use the updated comment and the captured code content remains unchanged

#### Scenario: Item without a comment shows an editable empty field

- **WHEN** a reference item has no comment
- **THEN** the dock lets the user add one later without recapturing the snippet

### Requirement: Annotated references include intent and code for agents

The system SHALL serialize each annotated reference as plain text that includes workspace-relative provenance, the optional comment when present, and the full captured code snippet in a fenced block. Line-scoped items SHALL use a `path:Lstart-Lend` provenance line. Whole-file items SHALL use the workspace-relative path alone. Agent handoff SHALL preserve comments for both PTY insertion and ACP draft attachments.

#### Scenario: Serialized selection includes comment and snippet

- **WHEN** the user copies or hands off a reference for `src/app.ts` lines 42-48 with the comment "Fix the null check"
- **THEN** the output contains a `src/app.ts:L42-L48` provenance line, the comment text, and a fenced block with the captured lines

#### Scenario: Serialized whole file includes comment and snippet

- **WHEN** the user copies or hands off a whole-file reference for `src/types.ts` with the comment "Context for the refactor"
- **THEN** the output contains the file path, the comment text, and a fenced block with the captured file content

#### Scenario: Comment omitted when empty

- **WHEN** a reference has no comment
- **THEN** serialization contains provenance and the fenced snippet without a comment section

#### Scenario: ACP handoff preserves per-item comments

- **WHEN** the user adds a kit with commented references to an unsent ACP draft
- **THEN** each draft attachment retains its comment and captured content without sending a prompt

### Requirement: Users can annotate unchanged code from the Edit surface

The system SHALL let users add commented references from the Edit code surface for any readable text selection or whole file, including code that is unchanged relative to Git. This capability SHALL not require Review mode or a diff hunk.

#### Scenario: User references unchanged context

- **WHEN** the user selects unchanged lines in an open file on the Edit surface and adds them to the kit with a comment
- **THEN** the kit captures the visible snippet and comment without requiring those lines to appear in a diff

## MODIFIED Requirements

### Requirement: Users can build a per-project reference kit

The system SHALL let users add selected ranges and whole files to a reference kit containing multiple references from the active project. Each item SHALL display its path, line range or whole-file scope, optional comment, and captured content size. The kit SHALL support removing individual items and clearing the kit. Add-to-kit actions SHALL be available from the editor and explorer context menus and SHALL use the annotation step before insertion.

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

- **WHEN** the user chooses Add to reference kit on a file row in the explorer context menu and confirms the annotation step
- **THEN** the whole file is added to the active project's reference kit

### Requirement: References have agent-ready serialization

The system SHALL serialize a single reference and a reference kit as plain text that preserves file paths, optional comments, line scope, and content boundaries. Copying a reference or kit SHALL leave the source files and editor buffers unchanged, and copying SHALL be repeatable without consuming the kit.

#### Scenario: User copies a kit repeatedly

- **WHEN** the user copies the same reference kit more than once
- **THEN** each copy contains the same ordered references with the same comments and snippets and the kit remains available

#### Scenario: Reference boundaries are preserved

- **WHEN** a kit contains references from multiple files
- **THEN** the copied text separates each item and identifies which comment and content belong to which path and line scope

### Requirement: Users can hand references to a selected agent

The system SHALL allow the user to choose a live PTY or ACP agent session for the active project as a handoff target. For a PTY session, handoff SHALL insert the selected reference or kit into that agent's terminal input without automatically submitting a prompt, command, or newline. For an ACP session, handoff SHALL add the selected context, including any per-item comments, to that session's prompt composer or unsent prompt draft without automatically sending `session/prompt`.

#### Scenario: User inserts a kit into a PTY agent

- **WHEN** the user selects a live PTY agent and chooses Paste reference kit
- **THEN** the kit text is inserted into that agent session and the agent is not submitted automatically

#### Scenario: User inserts a kit into the planning agent

- **WHEN** the user selects the Plan next task agent and chooses Paste reference kit
- **THEN** the kit text is inserted into that agent session and the agent is not submitted automatically

#### Scenario: User drafts a kit for an ACP agent

- **WHEN** the user selects a live ACP agent and chooses Add reference kit to prompt
- **THEN** the session's prompt draft contains the references with their path, line provenance, optional comments, and captured content and no ACP prompt is sent

#### Scenario: User targets a different agent

- **WHEN** the user changes the handoff target from the planning agent to the implementation agent
- **THEN** the next handoff is inserted into the implementation agent and does not alter the planning agent

#### Scenario: No live target is available

- **WHEN** the user attempts a direct handoff without a live agent target
- **THEN** the system reports that no live agent is available and keeps the reference available for ordinary clipboard copying

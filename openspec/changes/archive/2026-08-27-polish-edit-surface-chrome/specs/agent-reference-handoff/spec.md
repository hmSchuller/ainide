## MODIFIED Requirements

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

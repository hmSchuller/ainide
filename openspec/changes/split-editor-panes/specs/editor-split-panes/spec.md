## Purpose

This capability lets users keep two related source files visible at once while retaining predictable file opening, tab organization, and unsaved-buffer safety.

## ADDED Requirements

### Requirement: Editor supports two independently tabbed panes

The Edit surface SHALL support a primary editor pane and, when opened, one secondary editor pane displayed vertically side by side. Each pane SHALL have its own ordered tabs and active tab, and a file SHALL belong to no more than one pane at a time.

#### Scenario: Workspace starts with one editor pane

- **WHEN** a workspace is opened
- **THEN** the Edit surface shows the primary editor pane and no secondary pane until the user requests one

#### Scenario: Secondary pane is visible

- **WHEN** the secondary pane has been opened
- **THEN** the primary and secondary panes are both visible side by side, each with its own tab strip and editor content area

#### Scenario: Secondary pane has no tabs

- **WHEN** all tabs are moved out of the secondary pane
- **THEN** the secondary pane remains visible with an empty-editor state until the user explicitly closes the split

### Requirement: Explorer clicks target a deterministic pane

The system SHALL open an unopened file in the primary pane when the user clicks it normally in the explorer. The system SHALL open an unopened file in the secondary pane when the user Shift-clicks it, creating the secondary pane on demand. If the file is already open in either pane, the system SHALL focus that existing pane and activate the existing tab rather than opening a duplicate.

#### Scenario: Normal click opens in the primary pane

- **WHEN** the user normally clicks an unopened file in the explorer
- **THEN** the file is added to and activated in the primary pane

#### Scenario: Shift-click opens in the secondary pane

- **WHEN** the user Shift-clicks an unopened file and the secondary pane does not exist
- **THEN** the secondary pane is created and the file is added to and activated in it

#### Scenario: Shift-click opens another file in an existing secondary pane

- **WHEN** the user Shift-clicks an unopened file while the secondary pane exists
- **THEN** the file is added to and activated in the secondary pane without changing the primary pane's active tab

#### Scenario: Opening an existing file does not duplicate it

- **WHEN** the user clicks or Shift-clicks a file already open in either pane
- **THEN** the existing pane is focused, its tab is activated, and no second copy of that file is created

### Requirement: Users can reorder and move tabs by dragging

The system SHALL allow users to drag a tab header to a new position within its current pane or to the other pane. A successful move SHALL preserve the file's content, dirty state, external-change conflict state, and active editor state. The destination tab SHALL become active after a cross-pane move.

#### Scenario: Reorder tabs within a pane

- **WHEN** the user drags a tab header to another position in the same pane's tab strip
- **THEN** the tab is inserted at the drop position and the pane's other tabs retain their relative order

#### Scenario: Move a tab to the other pane

- **WHEN** the user drags a tab header from one pane to the other pane's tab strip or editor surface
- **THEN** the tab is removed from the source pane, inserted at the requested destination position, and activated in the destination pane

#### Scenario: Move a dirty tab between panes

- **WHEN** the user moves a tab whose buffer has unsaved changes or an external-change conflict
- **THEN** the tab remains dirty or conflicted after the move and no save or reload occurs

### Requirement: Pane focus controls editor actions

The system SHALL track which editor pane is focused. File editing, tab activation, line navigation, and save commands initiated from the editor surface SHALL target that pane's active tab. Switching between Edit and Review modes SHALL preserve the open panes and their tab state.

#### Scenario: Save the focused pane

- **WHEN** the user focuses a pane and invokes the existing save command
- **THEN** the active tab in the focused pane is saved rather than an active tab in the other pane

#### Scenario: Switch modes with split editors open

- **WHEN** the user switches from Edit mode to Review mode and later returns to Edit mode
- **THEN** the same pane arrangement, tab ownership, active tabs, and unsaved buffers are restored

### Requirement: Split layout remains usable at narrow widths

The editor surface SHALL remain usable on narrow screens when two panes are open and SHALL NOT require both panes to be compressed into unreadable fixed-width columns. Users SHALL retain access to each pane and its tab controls.

#### Scenario: Narrow viewport with two panes

- **WHEN** the viewport is too narrow for two readable side-by-side panes
- **THEN** the interface presents a usable pane navigation or scrolling treatment that allows the user to access both panes and their tabs

## ADDED Requirements

### Requirement: Shift-click closes an editor tab

The system SHALL close an editor tab when the user Shift-clicks its tab label in either editor pane. Shift-click tab close SHALL use the same close semantics as the tab close control, including flushing pending auto-save and prompting before discarding changes that could not be saved. Explorer Shift-click behavior SHALL remain unchanged.

#### Scenario: Shift-click closes the tab

- **WHEN** the user Shift-clicks an editor tab label
- **THEN** that tab is removed from its pane using the normal close flow

#### Scenario: Shift-click on an inactive tab

- **WHEN** the user Shift-clicks a tab that is not active in its pane
- **THEN** the tab is closed without activating it first

#### Scenario: Explorer Shift-click is unchanged

- **WHEN** the user Shift-clicks a file in the explorer
- **THEN** the file is opened or focused in the secondary pane and is not closed

#### Scenario: Terminal tabs are unaffected

- **WHEN** the user Shift-clicks a terminal tab header
- **THEN** terminal session behavior is unchanged

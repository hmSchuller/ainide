## ADDED Requirements

### Requirement: Manual path entry is presented before directory browsing

The workspace picker SHALL present the free-text directory path entry before the
click-based current-directory navigation controls and child-directory list. The explicit
`Open project` action SHALL be placed directly below the manual-entry block, while optional
path suggestions remain associated with that block and appear before the action when visible.

#### Scenario: Manual entry is the primary picker surface

- **WHEN** the workspace picker is displayed
- **THEN** the directory path field appears before the current-directory display, navigation
  controls, and child-directory list

#### Scenario: Open action follows manual entry

- **WHEN** the workspace picker displays the manual path field
- **THEN** the `Open project` action appears directly below the field and any visible path
  suggestions, before the click-based directory browser

#### Scenario: Suggestions remain attached to manual entry

- **WHEN** the user types a path segment that has matching immediate child directories
- **THEN** the suggestions appear within the manual-entry block and do not displace the
  click-based browser above the path field or obscure the `Open project` action

#### Scenario: Manual and click-based controls remain usable on narrow screens

- **WHEN** the workspace picker is displayed in a narrow viewport
- **THEN** the manual-entry block remains above the directory browser, the open action remains
  reachable beneath it, and the browser navigation controls remain usable below

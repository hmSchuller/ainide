## ADDED Requirements

### Requirement: Review uses the full workbench width

When Review mode is active, the system SHALL hide ainide's workspace explorer and its resize splitter so the Review surface occupies the available workbench width. The Review mode SHALL continue to preserve the explorer's project-local browsing state for when the user returns to a mode that displays it.

#### Scenario: User enters Review mode on desktop

- **WHEN** the user switches from Edit, Agents, or LazyGit to Review mode
- **THEN** ainide's workspace explorer and explorer splitter are not visible or interactive, and the Review surface expands into their former space

#### Scenario: User enters Review mode with the mobile explorer open

- **WHEN** the user switches to Review mode while the mobile explorer drawer is open
- **THEN** the drawer closes and does not overlay or obscure the Review surface

#### Scenario: User returns from Review mode

- **WHEN** the user switches from Review mode to Edit, Agents, or another mode that displays the workspace explorer
- **THEN** the explorer is visible again with its prior width, expanded directories, cached listings, and selected path preserved

#### Scenario: Review mode does not alter explorer data

- **WHEN** the user spends time in Review mode and then returns to the explorer
- **THEN** entering Review has not renamed, deleted, reloaded, or otherwise changed workspace files or explorer directory state

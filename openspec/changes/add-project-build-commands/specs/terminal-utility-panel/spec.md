# terminal-utility-panel Specification (delta)

## ADDED Requirements

### Requirement: Terminal utility panel is available in all primary modes

On all primary mode surfaces (Edit, Review, Agents, and LazyGit), the bottom terminal utility panel SHALL be rendered, and SHALL start collapsed when no persisted collapse preference exists for the browser session. The panel's collapse control SHALL honor each requested expand or collapse transition, including repeated use and transitions from maximized state.

#### Scenario: First visit to Edit mode

- **WHEN** the user opens a workspace in Edit mode with no saved terminal-panel preference
- **THEN** the terminal utility panel is collapsed and the editor area uses the available vertical space

#### Scenario: User expands the panel

- **WHEN** the user expands the collapsed terminal utility panel
- **THEN** the panel shows terminal tabs and output at the user's chosen height

#### Scenario: User collapses an expanded panel

- **WHEN** the user expands the terminal utility panel and then activates its collapse control
- **THEN** the panel remains collapsed, its terminal body is hidden, and the surface above uses the reclaimed vertical space

#### Scenario: User collapses a maximized panel

- **WHEN** the user maximizes the terminal utility panel and then activates its collapse control
- **THEN** maximized state is cleared and the panel remains collapsed

#### Scenario: Agents mode renders the utility panel

- **WHEN** the user switches to Agents mode
- **THEN** the bottom terminal utility panel is rendered, collapsed or expanded according to its current state

#### Scenario: LazyGit mode renders the utility panel

- **WHEN** the user switches to LazyGit mode
- **THEN** the bottom terminal utility panel is rendered alongside the Lazygit surface, collapsed or expanded according to its current state

## REMOVED Requirements

### Requirement: Terminal utility panel defaults to collapsed

**Reason**: The panel was scoped to Edit/Review and explicitly hidden in Agents mode; it is now rendered in all primary modes, so the mode-scoped default no longer holds.

**Migration**: The requirement is replaced by "Terminal utility panel is available in all primary modes", which retains the collapsed-by-default and collapse-transition behavior and extends availability to Agents and LazyGit modes. The removed scenario "Agents mode hides the utility panel" is superseded by "Agents mode renders the utility panel".

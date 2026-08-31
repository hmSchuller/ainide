## MODIFIED Requirements

### Requirement: Terminal utility panel defaults to collapsed

On Edit and Review surfaces, the bottom terminal utility panel SHALL start collapsed when no persisted collapse preference exists for the browser session. The panel's collapse control SHALL honor each requested expand or collapse transition, including repeated use and transitions from maximized state. Agents mode SHALL continue to hide the utility panel entirely.

#### Scenario: First visit to Edit mode

- **WHEN** the user opens a workspace in Edit mode with no saved terminal-panel preference
- **THEN** the terminal utility panel is collapsed and the editor area uses the available vertical space

#### Scenario: User expands the panel

- **WHEN** the user expands the collapsed terminal utility panel
- **THEN** the panel shows terminal tabs and output at the user's chosen height

#### Scenario: User collapses an expanded panel

- **WHEN** the user expands the terminal utility panel and then activates its collapse control
- **THEN** the panel remains collapsed, its terminal body is hidden, and the editor area uses the reclaimed vertical space

#### Scenario: User collapses a maximized panel

- **WHEN** the user maximizes the terminal utility panel and then activates its collapse control
- **THEN** maximized state is cleared and the panel remains collapsed

#### Scenario: Agents mode hides the utility panel

- **WHEN** the user switches to Agents mode
- **THEN** the bottom terminal utility panel is not shown regardless of its collapsed state on Edit or Review

### Requirement: Terminal panel collapse preference persists locally

The system SHALL persist the user's collapsed or expanded terminal utility panel preference in browser-local storage and restore it on subsequent visits. Clearing maximized state SHALL NOT overwrite the current collapse preference. The preference SHALL NOT be written to the disk-backed project session snapshot.

#### Scenario: Preference survives reload

- **WHEN** the user expands the terminal utility panel and later reloads the browser
- **THEN** the panel restores in the expanded state

#### Scenario: Collapsed preference survives a maximize transition

- **WHEN** the user maximizes the terminal utility panel, collapses it, and later reloads the browser
- **THEN** the panel restores in the collapsed state

#### Scenario: Preference is not in session snapshot

- **WHEN** the project session snapshot is serialized to disk
- **THEN** it does not include terminal utility panel collapse state

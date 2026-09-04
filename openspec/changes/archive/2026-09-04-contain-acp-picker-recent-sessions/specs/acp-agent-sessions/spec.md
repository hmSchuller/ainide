## ADDED Requirements

### Requirement: Picker presents recent sessions collapsed by default

The system SHALL present each provider's recent resumable sessions collapsed behind a disclosure toggle when that provider's recent-session state is available and non-empty. The toggle SHALL show the recent-session count, SHALL start collapsed with zero preview rows, SHALL expand and collapse independently per provider, and SHALL reset to collapsed each time the picker opens. Providers whose recent-session state is loading, empty, or unavailable SHALL show the existing muted one-liner with no toggle. Start-new entries SHALL remain visible without expanding any toggle, and selecting a recent session SHALL keep the existing resume behavior.

#### Scenario: Picker opens with recents collapsed

- **WHEN** the user opens the new-agent picker and a provider has available recent sessions
- **THEN** the provider shows its start-new entry and a collapsed toggle labeled with the recent-session count, and no recent-session rows are visible for that provider

#### Scenario: User expands a provider's recents

- **WHEN** the user activates a provider's collapsed recents toggle
- **THEN** that provider's recent sessions render ordered most-recent-first with titles and recency, the toggle exposes its expanded state, and activating it again collapses the list

#### Scenario: Providers expand independently

- **WHEN** two providers both have available recent sessions and the user expands one of them
- **THEN** the other provider's recents remain collapsed and its start-new entry stays visible

#### Scenario: Non-available states have no toggle

- **WHEN** a provider's recent-session state is loading, empty, or unavailable
- **THEN** the picker shows the existing muted status line for that provider with no disclosure toggle and keeps its start-new entry available

#### Scenario: Picker reopens collapsed

- **WHEN** the user expands a provider's recents, closes the picker, and reopens it
- **THEN** all providers' recents are collapsed again

### Requirement: Picker dialog stays within the viewport

The system SHALL bound the new-agent picker dialog to the viewport height and SHALL scroll an inner provider list when content overflows, so the dialog header and Cancel action remain visible and reachable without page-level scrolling on any screen size.

#### Scenario: Many sessions do not explode the modal

- **WHEN** two providers each return a full recent-session list and the user opens the picker
- **THEN** the dialog height stays within the viewport, the provider list is internally scrollable, and Cancel remains visible without expanding any toggle

#### Scenario: Expanded recents stay contained on small screens

- **WHEN** the user expands a provider's recents on a small viewport
- **THEN** the dialog remains viewport-bounded, overflow scrolls inside the provider list, and the header and Cancel action stay reachable

#### Scenario: Start-new stays reachable while collapsed

- **WHEN** the picker holds several providers with all recents collapsed
- **THEN** every provider's start-new entry is reachable without scrolling past recent-session rows

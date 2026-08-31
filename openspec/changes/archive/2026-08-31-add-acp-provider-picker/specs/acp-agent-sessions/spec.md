## MODIFIED Requirements

### Requirement: Users can start configured ACP agent sessions

The system SHALL present an in-app picker containing one entry for each configured local ACP provider and SHALL allow the user to choose only from those providers. Selecting a provider SHALL start a new session immediately for the active project without requesting a user-supplied session title or exposing a PTY fallback. The ainide server SHALL launch the configured agent process over stdio, associate the session with the active project and absolute workspace root, and expose a local session identity distinct from the provider's ACP session identifier.

#### Scenario: User starts an OpenCode session

- **WHEN** the user opens the new-agent action and selects the configured OpenCode ACP provider
- **THEN** the server immediately launches the provider's ACP command, completes the connection setup, and shows the new session in the active project's agent workbench without another title or provider prompt

#### Scenario: Only configured ACP providers are offered

- **WHEN** the configured providers are Cursor and OpenCode
- **THEN** the picker displays those providers using their configured labels and does not display an unconfigured provider, a free-form provider input, or a PTY option

#### Scenario: No ACP providers are configured

- **WHEN** the provider list is empty
- **THEN** the picker shows that no ACP providers are configured, does not create a session, and does not fall back to a PTY agent

#### Scenario: Configured ACP command is unavailable

- **WHEN** the user selects a provider whose executable or required arguments are unavailable
- **THEN** the system reports a startup error, does not create a live session, and leaves existing sessions unchanged

### Requirement: Provider-generated session titles preserve explicit user renames

The system SHALL assign a usable provisional title from the selected provider's configured label until the provider supplies a non-empty title through the ACP session metadata update. A valid provider-generated title SHALL replace the provisional title and SHALL be published to the browser and local session state. After the user explicitly renames a session, that user title SHALL remain authoritative and later provider-generated title updates SHALL NOT replace it. Empty, null, malformed, or unavailable provider titles SHALL NOT leave the session without a usable title.

#### Scenario: Provider supplies a title after session creation

- **WHEN** an ACP provider sends a valid `session_info_update` containing a title for a newly created session
- **THEN** the workbench displays the provider-generated title in place of the provisional provider label and the title is included in subsequent session snapshots

#### Scenario: Provider does not supply a title

- **WHEN** a provider creates a session but never sends a usable title update
- **THEN** the session remains visible with its provisional provider-label title and remains usable for prompting and renaming

#### Scenario: User rename takes precedence over a later provider update

- **WHEN** the user renames a session and the provider later sends a different session title
- **THEN** the workbench retains the user-selected title and does not replace it with the provider title

#### Scenario: User rename remains authoritative after restart

- **WHEN** a user-renamed ACP session is restored after an ainide restart and the provider sends a different title
- **THEN** the restored session retains the user-selected title and the provider update does not overwrite it

#### Scenario: Provider sends an unusable title

- **WHEN** a provider sends an empty, null, malformed, or otherwise invalid title update
- **THEN** the system keeps the current usable title and does not display a blank or invalid session title

### Requirement: ACP session persistence reflects provider resumability

The system SHALL persist only the local metadata needed to identify an ACP provider session, its project, workspace, display name, title ownership, and resumability state, together with validated primitive provider-scoped configuration preferences for use by future new sessions. The system SHALL NOT persist ACP authentication secrets, session tokens, provider environment secrets, or live protocol streams. After a server restart, the system SHALL attempt ACP loading or resuming only when the agent advertised the corresponding capability and shall not claim that a non-resumable session was restored. Persisted provider preferences SHALL NOT override the configuration of an existing restored ACP conversation.

#### Scenario: Provider supports session loading

- **WHEN** a persisted ACP session belongs to an agent that advertises session loading or resuming and the provider can authenticate
- **THEN** the system reconnects to the provider and restores the session history or continuation state using the supported ACP method

#### Scenario: Provider cannot resume a persisted session

- **WHEN** a persisted ACP session lacks a supported loading or resuming capability
- **THEN** the system marks the session as non-resumable or offers an explicit new-session action without presenting a new session as the old conversation

#### Scenario: Provider preferences survive a server restart

- **WHEN** a user has successfully selected a provider configuration value, the server restarts, and the user starts a new session for that provider
- **THEN** the system loads the preference from local session state and attempts to apply it to the new provider session

#### Scenario: Restored conversation configuration is preserved

- **WHEN** a persisted ACP conversation is restored after restart and the provider reports its current session configuration
- **THEN** the system preserves the restored conversation's provider-reported configuration rather than replacing it with the last-used new-session preference

#### Scenario: Persisted title ownership is respected during restoration

- **WHEN** a persisted session records an explicit user title and the restored provider reports a different title
- **THEN** the system keeps the persisted user title and does not allow the provider update to replace it

## MODIFIED Requirements

### Requirement: Users can start configured ACP agent sessions

The system SHALL present an in-app picker containing one entry for each configured local ACP provider that is enabled for the active project, and SHALL allow the user to choose only from those providers. A configured provider that is disabled for the active project SHALL NOT be offered in the picker. Selecting a provider SHALL start a new session immediately for the active project without requesting a user-supplied session title or exposing a PTY fallback. The ainide server SHALL launch the configured agent process over stdio, associate the session with the active project and absolute workspace root, and expose a local session identity distinct from the provider's ACP session identifier.

#### Scenario: User starts an OpenCode session

- **WHEN** the user opens the new-agent action and selects the configured OpenCode ACP provider
- **THEN** the server immediately launches the provider's ACP command, completes the connection setup, and shows the new session in the active project's agent workbench without another title or provider prompt

#### Scenario: Only configured ACP providers are offered

- **WHEN** the configured providers are Cursor and OpenCode
- **THEN** the picker displays those providers using their configured labels and does not display an unconfigured provider, a free-form provider input, or a PTY option

#### Scenario: Project-disabled providers are not offered

- **WHEN** the configured providers are Cursor, OpenCode, and Gemini, and Gemini is disabled for the active project
- **THEN** the picker displays Cursor and OpenCode and does not display Gemini

#### Scenario: No ACP providers are configured

- **WHEN** the provider list is empty
- **THEN** the picker shows that no ACP providers are configured, does not create a session, and does not fall back to a PTY agent

#### Scenario: All configured providers are disabled for the project

- **WHEN** every configured provider is disabled for the active project
- **THEN** the picker shows that no ACP providers are available for the project, does not create a session, and does not fall back to a PTY agent

#### Scenario: Configured ACP command is unavailable

- **WHEN** the user starts a provider whose executable or required arguments are unavailable
- **THEN** the system reports a startup error, does not create a live session, and leaves existing sessions unchanged

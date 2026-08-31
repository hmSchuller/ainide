## MODIFIED Requirements

### Requirement: Agent sessions have identifiable status and names

The system SHALL show each agent session with a user-visible title and reliable connection or process status. A title MAY initially be a provisional provider label and MAY later be supplied by the ACP provider. The user SHALL be able to distinguish at least connecting, live, waiting for user input, disconnected, and exited states when applicable and SHALL be able to rename a session for its purpose. After an explicit user rename, the user-selected title SHALL remain authoritative over later provider-generated title updates, including after session restoration.

#### Scenario: User distinguishes sessions and providers

- **WHEN** two sessions have titles supplied by the user or their providers and use different configured ACP providers
- **THEN** the Agents navigator displays each title, provider identity, and individual current status

#### Scenario: Provider title replaces a provisional title

- **WHEN** an ACP session initially displays its provider label and the provider later supplies a valid session title
- **THEN** the Agents navigator updates that session's visible title without changing its provider identity, status, conversation, or terminal state

#### Scenario: User rename overrides provider title

- **WHEN** the user renames an ACP session and the provider later supplies another title
- **THEN** the Agents navigator retains the user-selected title

#### Scenario: User distinguishes parallel work

- **WHEN** two agent sessions have been given distinct titles such as "Implement" and "Plan next task"
- **THEN** the Agents navigator displays those titles and their individual live or exited status

#### Scenario: An agent exits or disconnects

- **WHEN** an ACP connection or PTY agent process exits unexpectedly
- **THEN** its session remains identifiable as disconnected or exited and its available conversation, tool activity, or terminal output remains viewable until the user closes the session

#### Scenario: An agent exits

- **WHEN** an agent process exits
- **THEN** its session remains identifiable as exited and its available terminal output remains viewable until the user closes the session

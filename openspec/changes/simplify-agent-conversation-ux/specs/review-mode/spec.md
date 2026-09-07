## ADDED Requirements

### Requirement: Agent inspection returns to the originating session

The system SHALL allow a user to open an agent-reported file or diff in the existing Edit or Review surface and SHALL retain enough browser-local context to return to the originating project, session, and relevant conversation activity. This navigation SHALL not require a delegation identity or create a delegation-specific review scope.

#### Scenario: User opens a reported file

- **WHEN** the user activates a file location from an ACP or PTY session
- **THEN** the application visibly opens the file in Edit, preserves the relevant location, and provides a return action to the originating session

#### Scenario: User opens a reported diff

- **WHEN** the user activates a diff or change from an agent session
- **THEN** the application opens the existing Review surface with the appropriate supported review scope and provides a route back to the originating session

#### Scenario: User returns from inspection

- **WHEN** the user uses the return action after inspecting a file or diff
- **THEN** the Agents mode restores the originating session and conversation context without starting or stopping an agent

## MODIFIED Requirements

### Requirement: Users can hand references to a selected agent

The system SHALL allow the user to choose a live PTY or ACP agent session for the active project as a handoff target. For a PTY session, handoff SHALL insert the selected reference or kit into that agent's terminal input without automatically submitting a prompt, command, or newline. For an ACP session, handoff SHALL add the selected context to that session's prompt composer or unsent prompt draft without automatically sending `session/prompt`.

#### Scenario: User inserts a kit into a PTY agent

- **WHEN** the user selects a live PTY agent and chooses Paste reference kit
- **THEN** the kit text is inserted into that agent session and the agent is not submitted automatically

#### Scenario: User inserts a kit into the planning agent

- **WHEN** the user selects the Plan next task agent and chooses Paste reference kit
- **THEN** the kit text is inserted into that agent session and the agent is not submitted automatically

#### Scenario: User drafts a kit for an ACP agent

- **WHEN** the user selects a live ACP agent and chooses Add reference kit to prompt
- **THEN** the session's prompt draft contains the references with their path and line provenance and no ACP prompt is sent

#### Scenario: User targets a different agent

- **WHEN** the user changes the handoff target from one live agent session to another
- **THEN** the next handoff is applied only to the newly selected session and does not alter the prior session's terminal input or prompt draft

#### Scenario: No live target is available

- **WHEN** the user attempts a direct handoff without a live PTY or ACP agent target
- **THEN** the system reports that no live agent is available and keeps the reference available for ordinary clipboard copying

### Requirement: Reference data remains local and transient

The system SHALL keep reference-kit contents in the browser session and SHALL NOT write them into the disk-backed project session snapshot or transmit them to a provider without an explicit user copy or handoff action. An explicit ACP handoff or submitted prompt MAY transmit selected reference content through the chosen agent and its provider, and the UI SHALL not represent that transmission as a background reference-kit sync. A browser reload MAY clear the reference kits.

#### Scenario: Browser reload clears transient kits

- **WHEN** the browser reloads after a user has built a reference kit
- **THEN** the kit is not reconstructed from the server session snapshot and no reference content is restored as persisted session data

#### Scenario: User explicitly sends ACP context

- **WHEN** the user submits an ACP prompt containing references from the kit
- **THEN** the selected content is sent only as part of that explicit prompt action and the kit itself remains transient in the browser

## ADDED Requirements

### Requirement: ACP reference context preserves visible buffer provenance

When an ACP prompt draft includes a reference captured from a dirty editor buffer, the system SHALL use the visible buffer content and SHALL retain the workspace-relative path and inclusive line scope in the rendered draft or supported ACP content representation without saving the buffer as a side effect.

#### Scenario: User drafts unsaved selected code for ACP

- **WHEN** the user selects lines from a dirty Monaco buffer and adds them to an ACP prompt draft
- **THEN** the draft contains the currently visible lines and identifies their file path and line range without changing the file on disk

## ADDED Requirements

### Requirement: ACP activity is grouped around the active conversation

The system SHALL present ACP activity in a readable conversation hierarchy centered on each user prompt and its corresponding agent response. Streaming message updates SHALL remain in their existing message, related tool activity SHALL remain inspectable, and unknown activity SHALL remain visibly unclassified rather than being promoted to a conclusion or system-verified result.

#### Scenario: One prompt produces mixed activity

- **WHEN** an ACP prompt produces messages, tool calls, file locations, and completion
- **THEN** the conversation presents the user request and agent response as the primary content, keeps related activity available beneath it, and preserves the original order for inspection

#### Scenario: A streamed message grows

- **WHEN** the provider appends chunks to an existing message
- **THEN** the rendered message updates in place without creating unrelated duplicate messages or losing the conversation's reading position

#### Scenario: Provider sends unknown activity

- **WHEN** the provider sends an update variant the client does not understand
- **THEN** the session remains usable, the sanitized activity remains inspectable, and the update is not treated as completion or verified evidence

### Requirement: Provider-reported subagent activity is rendered as session activity

The system SHALL render subagent activity when the ACP provider supplies a supported association between that activity and the selected parent session. The display SHALL show the provider-reported subagent identity and available status or latest activity, allow the user to inspect supported details, and SHALL omit unavailable fields rather than inventing them.

#### Scenario: Subagent starts work

- **WHEN** the provider reports that a named subagent has started work for the current ACP session
- **THEN** the conversation shows a compact subagent activity item with the reported identity and active state

#### Scenario: Subagent finishes or fails

- **WHEN** the provider reports completion or failure for a displayed subagent
- **THEN** the subagent item shows that reported terminal state while the parent session remains independently usable

#### Scenario: Subagent data is unavailable

- **WHEN** the provider does not expose subagent identity or activity
- **THEN** the client does not scrape or infer subagents from arbitrary message or terminal text

### Requirement: ACP conversation recovery is obvious and local to the session

The system SHALL expose clear session-local recovery actions for authentication requirements, pending decisions, prompt cancellation, provider failure, reconnecting, and exited sessions. Recovery controls SHALL affect only the selected session and SHALL not require a delegation or global workflow state.

#### Scenario: Provider connection fails

- **WHEN** the selected ACP provider disconnects or exits unexpectedly
- **THEN** the conversation remains inspectable, the failure state is visible, and the user receives the available session-local recovery action

#### Scenario: User cancels a pending prompt

- **WHEN** the user cancels an active prompt while an ACP permission or structured-input request is pending
- **THEN** the pending request is resolved according to the existing protocol behavior and the cancelled state is visible in that session

#### Scenario: User starts another session

- **WHEN** the user creates or selects another ACP session
- **THEN** its conversation, composer draft, status, and subagent display remain independent from the currently selected session

## REMOVED Requirements

### Requirement: Delegation-backed ACP session history

**Reason**: ACP conversation history does not need durable delegation, evidence-ledger, or cross-session context state to provide a polished conversation experience.

**Migration**: Keep provider session history and existing local session metadata. Treat handoff prompts as ordinary user-managed text that is copied or pasted explicitly into another session.

#### Scenario: User moves work to another session

- **WHEN** the user asks the active agent to produce a handoff prompt and starts another session
- **THEN** the new session remains independent and receives information only when the user explicitly pastes or submits the handoff prompt

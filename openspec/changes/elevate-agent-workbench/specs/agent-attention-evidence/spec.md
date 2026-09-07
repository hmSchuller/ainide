## Purpose

Lets users discover work that needs intervention and judge agent outcomes from local, provenance-labelled evidence instead of polling every session or trusting unsupported attribution.

## ADDED Requirements

### Requirement: Actionable attention is visible outside the owning session
The system SHALL surface unresolved permission, elicitation, authentication, failure, exit, reconnect, collision, and review-ready events in the owning delegation and in a global attention summary. Hidden-project summaries SHALL identify the project and delegation but SHALL NOT expose controls that operate on that project until the user switches to it.

#### Scenario: Hidden project needs permission
- **WHEN** an ACP execution in a hidden project requests permission
- **THEN** the global summary identifies that the project and delegation need attention, and selecting it switches to the project before showing decision controls

#### Scenario: Attention is resolved
- **WHEN** the user resolves the request or acknowledges the terminal event that created an attention item
- **THEN** the item no longer appears unresolved while its safe evidence record remains available

### Requirement: Evidence records disclose provenance
The system SHALL record bounded local evidence for delegation prompts, lifecycle transitions, user decisions, provider-reported activity, system-observed file activity, explicit checks, Git baselines, and review outcomes. Every record SHALL identify whether it was user-declared, provider-reported, or system-observed and SHALL not elevate one source into a stronger claim without deterministic support.

#### Scenario: Provider reports a test command
- **WHEN** an ACP provider reports a terminal tool call and successful result
- **THEN** the evidence identifies the provider as the source and does not claim that ainide independently verified the test

#### Scenario: Workspace changes during shared work
- **WHEN** Git status changes while multiple actors share a checkout and no defensible execution attribution exists
- **THEN** the UI calls it workspace activity and does not label it as an agent's change

### Requirement: Evidence is summarized without hiding raw facts
The system SHALL provide turn- and delegation-level summaries of current action, files, checks, decisions, errors, and outcomes while retaining navigation to the underlying supported ACP activity or operational event. Unknown or unavailable evidence SHALL be displayed as unknown rather than inferred.

#### Scenario: User inspects a completed turn
- **WHEN** an ACP turn has messages, tool calls, file locations, terminal output, and a completion event
- **THEN** the session presents a concise outcome and evidence summary with an option to inspect the ordered underlying activity

#### Scenario: PTY remains quiet
- **WHEN** a live PTY emits no deterministic completion signal
- **THEN** the system reports its process and activity facts without declaring it idle, blocked, successful, or complete

### Requirement: High-priority state changes are accessible
The system SHALL announce newly blocking attention, execution failure, confirmed process exit, and completed work through a bounded accessible status channel. Streaming transcript content SHALL NOT prevent users from navigating or hearing higher-priority state changes.

#### Scenario: Unfocused execution requests input
- **WHEN** an unfocused execution begins waiting for user input
- **THEN** keyboard and assistive-technology users receive an actionable notification and can navigate directly to the owning delegation

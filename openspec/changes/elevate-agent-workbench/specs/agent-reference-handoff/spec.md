## ADDED Requirements

### Requirement: References are presented as context bundles
The system SHALL present editor-kit references, ACP draft attachments, and PTY handoffs through a common context-bundle vocabulary. Each item SHALL show workspace-relative provenance, line or file scope, capture source, capture time, size, freshness when determinable, destination, and whether it is local, inserted, queued, or sent.

#### Scenario: Captured file changes later
- **WHEN** a context item was captured from a file whose current content can be shown to differ
- **THEN** the bundle marks the snapshot stale and lets the user retain, refresh, or remove it without silently replacing captured content

#### Scenario: Provenance cannot be refreshed
- **WHEN** current content cannot be safely compared with a captured item
- **THEN** freshness is shown as unknown rather than current

### Requirement: Context destination and transmission are explicit
The focused delegation SHALL be the default context destination unless the user explicitly locks another live execution. ACP transmission SHALL attach context to an unsent or queued prompt; PTY transmission SHALL insert serialized text without a newline. The UI SHALL identify the exact destination and confirm that insertion did not submit work.

#### Scenario: User inserts context into PTY
- **WHEN** the user sends a context bundle to a PTY execution
- **THEN** serialized context is inserted without submission and the system confirms the destination and unsent state

#### Scenario: Locked destination differs from focus
- **WHEN** the user locks a destination and then focuses another delegation
- **THEN** the locked destination remains visibly distinct and the next handoff names it before transmission

### Requirement: Context respects isolated execution roots
Context search, capture, refresh, and transmission SHALL resolve against the selected delegation execution workspace. Cross-project or cross-worktree content SHALL require an explicit user action and SHALL not be silently reinterpreted under another root.

#### Scenario: Isolated execution receives context
- **WHEN** an isolated delegation attaches a file from its worktree
- **THEN** the item is read from and labelled relative to that worktree rather than the active project's primary checkout

## Purpose

Lets users choose between transparent shared-checkout execution and Git worktree isolation for parallel delegations, with safe creation, review, integration, and cleanup behavior.

## ADDED Requirements

### Requirement: Delegations declare a workspace strategy
For a Git project, the system SHALL let the user choose the current shared checkout or an isolated Git worktree when starting an executable delegation. The selected execution root SHALL be visible and SHALL scope all ACP, PTY, filesystem, terminal, reference, and review operations for that delegation.

#### Scenario: User chooses an isolated workspace
- **WHEN** the user starts a delegation using worktree isolation
- **THEN** the system creates a project-owned worktree and branch through a fixed server operation and starts the execution in that root

#### Scenario: Project is not a Git repository
- **WHEN** the active project cannot support Git worktrees
- **THEN** the system offers shared-workspace execution, explains that isolation is unavailable, and does not simulate isolation

### Requirement: Shared work discloses attribution limits and collisions
The system SHALL identify shared-checkout delegations and SHALL not promise per-delegation file attribution. When concurrent activity creates a deterministic overlap or dirty-buffer conflict, the system SHALL surface the collision without overwriting user content or assigning blame without evidence.

#### Scenario: Two shared executions overlap
- **WHEN** concurrent executions report or are observed touching the same path
- **THEN** the affected delegations show a collision warning and retain source-labelled evidence

### Requirement: Isolated outcomes can be reviewed and integrated explicitly
The system SHALL provide a delegation-baseline review for an isolated worktree and explicit integration actions that disclose the source branch, target checkout, dirty-state conflicts, and operation result. The system SHALL NOT merge, rebase, cherry-pick, or delete a worktree automatically merely because a delegation completed.

#### Scenario: User reviews isolated work
- **WHEN** an isolated delegation becomes review-ready
- **THEN** Review shows its changes against the recorded baseline without mixing unrelated active-checkout changes

#### Scenario: Integration conflicts
- **WHEN** the user requests integration and Git reports conflicts or an unsafe dirty target
- **THEN** the operation stops safely, reports the conflict, and preserves the worktree and branch for recovery

### Requirement: Worktree cleanup is explicit and safe
The system SHALL remove a managed worktree only after the user requests cleanup and the server verifies that doing so will not discard unintegrated or uncommitted work without explicit confirmation. Path operations SHALL remain bounded to worktrees registered to the owning project and delegation.

#### Scenario: Worktree contains unintegrated changes
- **WHEN** the user requests cleanup for a worktree with unintegrated changes
- **THEN** the system warns about the retained work and does not remove it without an explicit destructive confirmation

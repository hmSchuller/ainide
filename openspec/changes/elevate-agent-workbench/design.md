## Context

See `proposal.md` for motivation and the capability deltas for behavioral contracts. Today the browser combines project-scoped PTY and ACP sessions into one navigator, renders at most a focused and pinned session, keeps ACP history and drafts in browser state, and persists only safe session descriptors. ACP updates already provide structured messages, plans, tools, locations, diffs, terminal activity, usage, turns, permissions, elicitation, configuration, and resumability; PTY agents provide an opaque terminal stream and process liveness.

The server owns all live processes and selected workspace roots. Multiple open projects may continue running while hidden. Git status and filesystem events describe workspace activity but cannot identify the actor that caused a change. Current parallel executions share a checkout, and current session close handling does not provide a reliable distinction between requested and confirmed termination.

The design must preserve local-only operation, authenticated API and WebSocket traffic, safe path resolution, explicit ACP permission decisions, real PTYs, provider-owned capabilities, and graceful server teardown. It must not persist secrets, raw live streams, terminal scrollback, or transient reference contents.

## Goals / Non-Goals

**Goals:**

- Make delegation the stable product object while sessions remain replaceable local execution resources.
- Give the browser a deterministic projection of work state, attention, continuity, and evidence without interpreting arbitrary PTY output.
- Support shared-checkout and optional isolated-worktree execution with truthful attribution boundaries.
- Make lifecycle operations transactional and user-visible across browser reconnect and process restart.
- Connect delegation, context, execution, evidence, and review into one navigable loop.
- Preserve bounded storage and rendering behavior for long-running local use.

**Non-Goals:**

- Autonomous agent-to-agent orchestration, scheduling, or delegation without a user action.
- Automatic permission approval or provider-specific privilege policy engines.
- Semantic interpretation of PTY text to infer plans, progress, success, or failure.
- Cloud synchronization, accounts, telemetry, hosted history, or remote notifications.
- Mandatory worktree isolation for every delegation.
- Automatic merge, rebase, cherry-pick, commit, push, or worktree deletion on completion.
- More than two full execution surfaces displayed simultaneously.
- Durable storage of raw ACP transcripts or context contents solely to create a history product.

## Decisions

### 1. Use a server-owned delegation aggregate

The server will own project-scoped `DelegationRecord` aggregates. A record contains a stable local id, goal, optional success criteria, lifecycle state, workspace strategy and root descriptor, baseline, bounded evidence references, execution descriptors, outcome, and timestamps. An execution links one ACP or PTY session to a delegation and records transport and continuity facts. Existing session managers remain responsible for processes and protocol traffic; they publish lifecycle and structured evidence into the aggregate.

The browser receives delegation projections and live execution state rather than manufacturing a durable work model from transient Zustand state. Draft delegation forms and unsent context may remain browser-local.

Alternative: keep sessions primary and add goal/status fields. Rejected because rollover, resume, recreation, retry with another provider, and archival would overload one session identity and make work disappear with its process.

### 2. Keep three state axes independent

Every execution projection separates:

```text
Work:       draft | active | needs_user | review_ready | blocked | completed | archived
Transport:  starting | connected | reconnecting | stopping | exited | failed
Continuity: fresh | reattached | resumed | recreated | non_resumable
```

Work state belongs primarily to the delegation. Transport and continuity belong to executions. Deterministic events may move work into `needs_user`, `blocked`, or `review_ready`; final acceptance and archive are explicit user actions. PTY state is `active` or user-declared unless process facts prove exit/failure.

Alternative: one normalized status enum. Rejected because combinations such as `needs_user + connected + resumed` carry independently useful truth.

### 3. Build attention as a bounded projection, not a second workflow system

Attention items derive from unresolved deterministic events: ACP permission/elicitation/authentication, confirmed failure or exit, reconnect failure, review readiness, and detected workspace collision. Items have stable ids, severity, project/delegation/execution ownership, event type, creation time, and resolution state. They do not contain secrets or full provider payloads.

The active project receives full actionable items. A global endpoint/event stream returns summary-safe items for all open projects. Selecting a hidden-project item switches project context before fetching or rendering action controls. There is no cross-project command endpoint.

Alternative: desktop notifications or a process dashboard. Rejected because they add interruption and cross-project operation without improving in-cockpit supervision.

### 4. Append source-labelled evidence and derive summaries from it

The evidence ledger is append-only and bounded per delegation. Records use source categories `user`, `provider`, and `system`; include event kind, execution/turn association, timestamp, sanitized summary, and optional structured metadata; and never store credentials, raw environment values, unrestricted terminal output, or full context bodies. Large ACP payloads remain in capped live history while evidence stores only bounded summaries and references.

Turn and delegation summaries are deterministic projections over recognized records. Provider success remains “provider reported”; explicit fixed server checks can be “system observed.” Generic Git or watcher changes are “workspace activity” unless an isolated root, baseline, or provider operation supplies stronger scope. The UI never relabels weak evidence as verified.

Alternative: ask the model to summarize itself. Rejected as the source of record because it adds latency, provider dependence, and unlabelled claims. Provider narrative can still appear as provider-reported evidence.

### 5. Group ACP history into client-owned turns

The client/server state pipeline will associate ACP activities with a local turn id beginning at accepted prompt dispatch and ending at completion, failure, or cancellation. Each turn projection exposes its user prompt, active deterministic operation, pending request, final agent message, and evidence summary, plus the existing ordered raw activities. Replay after load reconstructs turn boundaries from prompt and turn events where possible; ambiguous legacy replay remains a historical activity group and is not assigned invented outcomes.

The session surface prioritizes the current turn narrative and final result. Thoughts, routine tools, raw diffs, terminal output, unknown events, and usage remain inspectable but subordinate. Virtualization or bounded rendering is required for long histories.

Alternative: preserve the flat event card list and add a generated summary header. Rejected because it leaves conversation structure, blocking decisions, and outcome navigation fragmented.

### 6. Keep PTY as an honest terminal execution

PTY creation becomes an explicit execution option whenever `agentCommand` is configured. The PTY session shell shows delegation intent, process/connection facts, context insertion history, observed workspace activity, baseline review, and explicit user work-state controls around the real xterm. It does not parse output for semantic phase or success.

Alternative: normalize PTY and ACP by scraping terminal text. Rejected because prompts, shells, TUIs, ANSI output, and provider versions make the inference unreliable and potentially unsafe.

### 7. Make process lifecycle operations confirmed and idempotent

Stop, remove, rollover, archive, and project close are separate commands. Stop requests transition to `stopping` and become `exited` only after server confirmation or observed process exit. API failure retains the visible execution with recovery actions. Removing an execution descriptor is disallowed while its process may be live. Project close first returns or computes a live-work impact summary and requires explicit confirmation from the UI.

Server shutdown remains terminal-owned and uses existing graceful teardown, while persisting safe final lifecycle facts. Browser disconnect never means process exit.

Alternative: optimistic local removal with best-effort server cleanup. Rejected because it can hide a live local process.

### 8. Support optional managed Git worktrees

For Git repositories, creation offers shared checkout or an isolated managed worktree. Fixed server operations call Git CLI to create a branch and worktree under an ainide-managed local directory derived from opaque ids, never user-provided shell fragments. The delegation records repository identity, base commit, branch, root, and integration state. Safe resolution treats the selected worktree as that execution's workspace boundary while retaining ownership association with the parent project.

Review compares the worktree against its baseline. Integration is an explicit fixed Git operation selected by the user after checking the target checkout and dirty state. Conflicts stop the operation and retain the branch/worktree. Cleanup verifies registration, dirty state, commits not reachable from the target, and integration status before removal.

Shared checkout remains supported and visibly carries ambiguous-attribution semantics. Deterministic overlapping provider file events and dirty-buffer conflicts can raise collision attention, but no actor blame is inferred.

Alternative: require worktrees. Rejected because non-Git projects, lightweight tasks, existing user workflows, and provider assumptions still need shared execution.

### 9. Unify references through browser-local context bundles

`ContextBundle` is the common browser model for editor captures, shared kit items, ACP `@` files, and PTY insertion. Items include relative path, scope, content snapshot, source (`visible_buffer` or `disk`), capture time, source workspace id, and optional current-content fingerprint. Destination and transmission state live with the draft/handoff, not the reusable source item.

Freshness checks compare safe fingerprints only on demand or relevant file events. Refresh is explicit. ACP sends structured supported content on explicit prompt dispatch; PTY serializes and inserts without newline. A destination defaults to focused delegation but can be visibly locked. Context contents remain absent from disk snapshots and global attention.

Alternative: persist bundles with delegations. Rejected because large or sensitive code snapshots are unnecessary for durable supervision and violate the current transient privacy boundary.

### 10. Make Review a delegation-aware inspection route

Navigation to a file or diff records a browser-local return location containing project, delegation, execution, turn, and viewport identity, switches visibly to Edit or Review, and exposes a return action. A new delegation review scope resolves to its recorded Git baseline and selected execution root. Existing working-tree, staged, commit, and branch scopes remain.

Review decisions append user evidence and move lifecycle state explicitly. Isolated integration remains a separate action after acceptance. Shared-checkout review labels the result as workspace activity when concurrent attribution cannot be proven.

Alternative: embed all diffs in the conversation. Rejected because Monaco and Difit are the established inspection surfaces and are better suited to substantial code review.

### 11. Adopt an attention-first responsive information architecture

Desktop uses a work navigator, one primary execution surface, optional comparison surface, and a compact evidence/context region. The navigator groups delegations by attention and state. Comparison replaces ambiguous “pin” language. Focus is the default context destination; a destination lock is an advanced explicit state.

Narrow screens show one execution and a sticky delegation/attention switcher. Session actions move into a labelled menu. Roving focus, direct next-attention navigation, proper dialog focus containment/restoration, visible focus, and bounded live-region announcements are part of the component contract.

Alternative: retain the current desktop layout and stack it vertically. Rejected because it separates mobile session switching from the supervised execution by excessive scrolling.

### 12. Version persistence and adopt legacy sessions conservatively

The snapshot schema gains versioned delegation descriptors, execution associations, evidence summaries, baseline/worktree descriptors, and continuity facts. On migration, each existing ACP or PTY descriptor becomes a legacy unassigned delegation unless an unambiguous association already exists. Existing provider ids and user-owned titles are preserved. No historical intent, outcome, turn attribution, or change authorship is synthesized.

Worktree registrations are validated against Git and the managed-root boundary at startup. Missing worktrees or branches produce blocked/recovery state rather than recreation. ACP resume and PTY recreation continue according to provider/process capabilities, now recording explicit continuity events.

Alternative: discard old descriptors and start clean. Rejected because active local work and provider resumability are shipped behavior.

## Risks / Trade-offs

- [The big-bang scope crosses UI, persistence, process lifecycle, Git, review, and protocol state] -> Land behind one internal snapshot version and feature boundary, verify each vertical slice, and switch the Agents surface only after migration and end-to-end tests pass.
- [Delegation metadata can become a second project-management system] -> Keep fields limited to intent, success criteria, state, executions, evidence, and outcome; exclude arbitrary boards, assignment, estimates, and collaboration.
- [Evidence summaries may imply certainty] -> Display source labels consistently, reserve verified language for deterministic server operations, and use unknown/unattributed states explicitly.
- [Worktree operations can lose work] -> Use fixed Git operations, preflight dirty and reachability checks, no automatic cleanup, explicit destructive confirmation, and focused recovery tests.
- [Cross-project attention can leak workspace details] -> Return bounded labels and event kinds only, preserve session-token checks, and require project activation before details or actions.
- [Long-running evidence and ACP histories consume memory or disk] -> Bound retained records, compact old activity to safe summaries, and expose retention limits without persisting raw streams.
- [Turn reconstruction from provider replay is incomplete] -> Preserve ambiguous replay as historical activity and never invent boundaries or outcomes.
- [Queued prompts can surprise users] -> Distinguish draft, queued, dispatching, and sent states; provide reorder/remove controls; dispatch only under explicit queue semantics.
- [Managed worktrees may conflict with users' external Git operations] -> Revalidate Git state before every operation and preserve recoverable records when external changes invalidate assumptions.
- [A single release migration is hard to roll back] -> Preserve old snapshot fields for one compatibility window, make new fields additive, and do not delete branches/worktrees during rollback.

## Migration Plan

1. Add versioned shared delegation, execution, evidence, attention, context, baseline, and isolation types while retaining compatibility with current session descriptors.
2. Add server persistence and migration that adopts current sessions as legacy delegations; publish projections without changing the existing Agents UI.
3. Make lifecycle operations confirmed and add attention/evidence capture around existing ACP and PTY managers.
4. Add managed-worktree and delegation-baseline review operations with path, Git-state, conflict, and cleanup tests.
5. Build the new browser store projection, creation flow, attention navigation, ACP turn surface, PTY shell, context bundles, and review-return route behind the replacement workbench boundary.
6. Run snapshot migration, security, lifecycle, reconnect, ACP replay, worktree, integration, accessibility, responsive, and end-to-end tests before enabling the new workbench by default.
7. Retain additive legacy snapshot reading for rollback. A rollback ignores new delegation UI metadata but must not remove managed worktrees or terminate otherwise valid live processes.

## Open Questions

- The exact bounded retention count and compaction threshold for evidence can be tuned after realistic long-session profiling without changing the behavioral model.
- The default branch-name prefix and managed worktree parent directory can follow configuration/platform conventions as long as they remain deterministic, local, validated, and user-visible.

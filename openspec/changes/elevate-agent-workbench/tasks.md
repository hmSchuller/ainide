## 1. Domain And Protocol Foundation

- [x] 1.1 Add shared delegation, execution, work-state, transport-state, continuity-state, outcome, and workspace-strategy types; verify shared package type tests cover valid projections and exhaustive states.
- [x] 1.2 Add shared attention and provenance-labelled evidence types with bounded/sanitized payload contracts; verify serialization tests reject secret-bearing or oversized metadata.
- [x] 1.3 Add shared context-bundle, Git baseline, managed-worktree, and delegation-review types; verify project and execution workspace identities cannot be confused by type-level and protocol tests.
- [x] 1.4 Extend authenticated HTTP and WebSocket protocol types for delegation lifecycle, attention summaries, evidence updates, confirmed execution operations, and isolation operations; verify `npm run typecheck` passes across shared, server, and web packages.

## 2. Persistence And Legacy Adoption

- [x] 2.1 Introduce a versioned safe snapshot schema for delegation descriptors, execution associations, continuity facts, bounded evidence, baselines, and worktree registrations; verify secrets, context bodies, live streams, and terminal scrollback are excluded in snapshot tests.
- [x] 2.2 Implement migration of existing ACP and PTY descriptors into legacy unassigned delegations while preserving provider ids and user-owned titles; verify fixtures do not invent goals, outcomes, attribution, or continuity.
- [x] 2.3 Validate persisted worktree and baseline records against project ownership and Git state during restoration; verify missing or externally changed worktrees become blocked recovery records rather than being recreated or deleted.
- [x] 2.4 Persist delegation and evidence transitions atomically with existing session snapshots; verify restart tests retain safe metadata and preserve current ACP resume and PTY recreation behavior.

## 3. Delegation And Evidence Services

- [x] 3.1 Add a project-scoped server delegation registry with create, update-intent, associate-execution, lifecycle, outcome, archive, and query operations; verify cross-project ids and unknown roots are rejected.
- [x] 3.2 Add bounded append-only evidence capture and deterministic delegation summary projection; verify user, provider, and system sources remain distinguishable and retention compaction preserves unresolved attention.
- [x] 3.3 Associate ACP prompt turns and PTY executions with delegations without changing process ownership; verify multiple executions and context rollover retain one stable delegation identity.
- [x] 3.4 Replace generic agent-change attribution with source-labelled workspace activity and baseline-scoped evidence; verify concurrent shared-checkout changes are never attributed to one agent without deterministic support.

## 4. Attention And Lifecycle Reliability

- [x] 4.1 Derive stable attention items for ACP permission, elicitation, authentication, failures, exits, reconnect failures, review readiness, and collisions; verify create, update, resolve, and restart behavior with focused server tests.
- [x] 4.2 Add a session-token-protected global attention summary containing bounded hidden-project metadata only; verify details and action endpoints still require activation and ownership of the target project.
- [x] 4.3 Refactor ACP and PTY stop/close flows into idempotent requested, stopping, confirmed-exited, failed, and removable transitions; verify transport/API failure never removes or hides a possibly live process.
- [x] 4.4 Add project-close impact reporting and explicit confirmed teardown semantics; verify closing is blocked or confirmed when live delegations exist and all processes still receive graceful cleanup.
- [x] 4.5 Record and publish fresh, reattached, resumed, recreated, non-resumable, reconnecting, and failed continuity events; verify browser reconnect creates no duplicate process and restart never claims PTY reattachment.

## 5. Managed Worktree Isolation

- [x] 5.1 Implement fixed Git CLI preflight and managed worktree creation under a validated ainide-owned root using opaque ids; verify traversal, symlink escape, non-Git, dirty-base, duplicate branch, and command-injection cases are rejected safely.
- [x] 5.2 Route ACP, PTY, filesystem, terminal, context, and review operations through the delegation execution root; verify requests cannot escape a worktree or cross into another project/delegation.
- [x] 5.3 Add baseline capture and status projection for shared and isolated strategies; verify isolated diffs are scoped to their worktree and shared diffs are labelled unattributed when concurrency exists.
- [x] 5.4 Implement explicit integration preflight and fixed integration operations that stop on dirty targets or conflicts; verify branches and worktrees remain recoverable after every failure mode.
- [x] 5.5 Implement explicit managed-worktree cleanup with dirty, unintegrated-commit, registration, ownership, and destructive-confirmation checks; verify no unregistered or valuable worktree can be removed implicitly.

## 6. Browser State And Creation Flow

- [x] 6.1 Replace session-primary project UI state with delegation projections, execution associations, attention, comparison, destination lock, inspection return location, and draft state; verify project switching preserves independent state without cross-project leakage.
- [x] 6.2 Build an intent-first creation flow for goal, success criteria, shared/isolated workspace, ACP provider or configured PTY agent, capabilities, and confirmation; verify PTY-only, ACP-only, disabled-provider, non-Git, startup-failure, and retry paths.
- [x] 6.3 Surface provider capabilities and configuration using negotiated facts without inventing unavailable options; verify provider-specific resume, permission, terminal, filesystem, cancellation, and model controls remain isolated.
- [x] 6.4 Add legacy-delegation adoption and recovery UI for restored descriptors, missing worktrees, non-resumable ACP sessions, and failed PTY recreation; verify every continuity state has an honest user-visible action.

## 7. Workbench Information Architecture

- [x] 7.1 Rebuild the navigator around needs-user, review-ready, working, quiet/unknown, and ended groups with independent work, transport, continuity, unread, and workspace indicators; verify unfocused and hidden-mode attention remains discoverable.
- [x] 7.2 Replace pin and implicit targeting with labelled focus, optional comparison, default focused destination, and explicit destination lock; verify focus/comparison/destination divergence cannot be mistaken and survives list updates.
- [x] 7.3 Add a global attention strip and next-attention navigation that switches project context before exposing controls; verify hidden-project actions cannot execute before the switch completes.
- [x] 7.4 Add labelled lifecycle menus and dialogs for stop, fresh context, resume, recreate, remove, archive, integration, cleanup, and project close; verify destructive effects and failures remain visible.
- [x] 7.5 Implement desktop and narrow-screen layouts with one primary surface, optional desktop comparison, and sticky mobile delegation/attention switching; verify representative desktop, tablet, and mobile viewport component tests.

## 8. ACP And PTY Execution Surfaces

- [x] 8.1 Associate accepted ACP prompts and replayed activity with local turn projections, preserving ambiguous legacy replay as unclassified history; verify streaming, cancellation, failure, rollover, resume burst, and unknown-update tests.
- [x] 8.2 Build the ACP turn narrative with prompt, current deterministic action, blocking decision, final response, evidence summary, and collapsible ordered raw activity; verify long histories remain bounded or virtualized and independent scroll-follow behavior remains correct.
- [x] 8.3 Promote permission, elicitation, and authentication into decision-grade blocking surfaces with option scope, delegation/provider context, and retained safe decision evidence; verify no request is auto-approved and cancellation resolves pending requests.
- [x] 8.4 Make the ACP composer state-aware with discoverable `@`, slash, newline, submit, draft, queue, dispatch, cancel, review-follow-up, and auth/exit recovery behavior; verify IME, optimistic recovery, queued removal/order, and no-accidental-concurrency cases.
- [x] 8.5 Move ACP configuration and capability identity into one deliberate execution header and remove duplicate hidden header structure; verify configuration updates remain session-scoped and accepted preferences behave as before.
- [x] 8.6 Build the PTY execution shell around the real xterm with delegation intent, deterministic process/connection facts, context insertion history, workspace activity, baseline review, and explicit user state controls; verify no semantic state is inferred from terminal output.

## 9. Context And Review Loop

- [x] 9.1 Consolidate editor selections, shared kit items, and ACP `@` files into context bundles with source, capture time, workspace, fingerprint, size, and transmission state; verify dirty-buffer and disk snapshots preserve their distinct provenance.
- [x] 9.2 Add on-demand and event-triggered freshness comparison with retain, refresh, and remove actions; verify missing, binary, changed, cross-worktree, and unknown-freshness behavior.
- [x] 9.3 Implement explicit ACP attach/queue/send and PTY insert-without-newline flows with named destination confirmation; verify no bundle crosses project/worktree boundaries or transmits without a user action.
- [x] 9.4 Add visible Edit navigation from ACP/PTTY file evidence with project, delegation, execution, turn, and viewport return state; verify opening evidence cannot occur invisibly behind Agents mode.
- [x] 9.5 Add delegation-baseline Review scope for shared and isolated roots plus return navigation; verify existing working-tree, staged, last-commit, and branch scopes remain functional.
- [x] 9.6 Add accept, request-changes, and undecided review outcomes as explicit delegation transitions and user evidence; verify acceptance does not automatically integrate or clean up isolated work.

## 10. Accessibility, Verification, And Release

- [x] 10.1 Implement roving keyboard navigation, next-attention shortcuts, labelled action menus, visible focus, dialog focus trapping/restoration, and logical decision order; verify keyboard-only component and browser tests.
- [x] 10.2 Add bounded accessible announcements for new blocking attention, failures, exits, context insertion, and review readiness while preventing streaming history from monopolizing announcements; verify with automated accessibility checks and manual screen-reader smoke tests.
- [x] 10.3 Add integrated scenarios covering two projects, mixed ACP/PTTY delegations, hidden attention, browser reconnect, server restart, rollover, queued follow-up, shared collisions, isolated review, failed integration, and safe cleanup; verify the end-to-end suite passes.
- [x] 10.4 Run focused security tests for session tokens, path traversal, symlink escape, worktree ownership, cross-project requests, ACP permission cancellation, process cleanup, and persisted-secret exclusion; verify all rejection paths have no filesystem or process side effects.
- [x] 10.5 Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; fix regressions and record any environment-only manual verification limitations.
- [x] 10.6 Update the README configuration and workflow guidance for delegations, ACP versus PTY, attention, continuity, context bundles, shared-checkout limits, worktree isolation, lifecycle actions, and review integration; verify documented controls and terminology match the shipped UI.

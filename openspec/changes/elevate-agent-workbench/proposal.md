## Why

ainide exposes capable local ACP and PTY sessions, but users still have to supervise them as process windows and raw event streams. A first-class developer-agent cockpit needs to organize work around durable intent, actionable attention, trustworthy evidence, safe parallelism, and explicit lifecycle semantics so users can delegate and review local work without continuously polling terminals or guessing what survived.

## What Changes

- Introduce a durable delegation as the primary user-facing unit of agent work, with a goal, optional success criteria, context, execution history, lifecycle, and outcome independent of any one ACP context or PTY process.
- Replace the flat session navigator with an attention- and progress-oriented work navigator that distinguishes working, needs-user, review-ready, blocked, completed, and archived work from transport and continuity state.
- Rebuild ACP sessions around turn narratives: user intent, current action, blocking decisions, final response, and a collapsible raw activity timeline, with evidence grouped by turn and labelled by source.
- Keep PTY sessions first-class and explicitly creatable while reporting only deterministic process facts and user-declared work state rather than inferring intent or completion from terminal text.
- Surface pending permissions, elicitation, authentication, failures, exits, unread completion, and reconnect problems across modes and projects through a global attention summary; require switching to the owning project before acting.
- Add a local evidence ledger for prompts, lifecycle transitions, permission decisions, provider-reported tool activity, observed workspace changes, explicit checks, Git baselines, and review outcomes, with provenance and confidence visible to the user.
- Replace misleading agent-change attribution with honest workspace activity unless a change can be tied to a delegation through a defensible baseline or provider event.
- Add optional per-delegation Git worktree isolation, branch identity, collision visibility for shared-checkout work, and an explicit path for reviewing and integrating isolated outcomes.
- Unify editor kits, ACP `@` attachments, and PTY insertion as context bundles with source, capture time, freshness, destination, size, and sent/unsent state while preserving explicit transmission and no-auto-submit guarantees.
- Connect session evidence directly to visible Edit and Review surfaces, including turn- or delegation-baseline diffs and a reliable route back to the originating work.
- Make create, reconnect, resume, recreate, rollover, stop, detach, remove, archive, project close, and shutdown distinct user-visible lifecycle operations; never hide a process unless its stop/removal outcome is known.
- Preserve provider-specific ACP capabilities and make them legible before delegation, including filesystem, terminal, permission, configuration, cancellation, and resumability behavior.
- Provide keyboard-first session navigation and intervention handling, accessible announcements for high-priority state changes, modal focus management, and a mobile supervision layout centered on attention and one active session.
- Persist only safe delegation descriptors, evidence metadata, decisions, baselines, and lifecycle state; continue excluding secrets, session tokens, provider environment values, live streams, terminal scrollback, and transient context contents.

## Capabilities

### New Capabilities

- `agent-delegations`: Durable work intent, execution association, lifecycle, outcome, persistence, and archive semantics above individual ACP or PTY sessions.
- `agent-attention-evidence`: Cross-session and cross-project attention summaries plus a provenance-aware local evidence ledger for supervision and review.
- `agent-workspace-isolation`: Optional Git worktree/branch isolation for delegations, shared-checkout collision disclosure, and explicit integration of isolated outcomes.

### Modified Capabilities

- `agent-workbench`: Organize the workbench around delegation state and attention, expose ACP and PTY creation, distinguish work/transport/continuity state, support comparison, lifecycle actions, keyboard operation, and mobile supervision.
- `acp-agent-sessions`: Group structured activity into turns, expose blocking requests and provider capabilities as decision-grade UI, support queued steering, and clarify resume, rollover, reconnect, and close behavior.
- `agent-reference-handoff`: Replace fragmented reference workflows with provenance- and freshness-aware context bundles while retaining explicit local transmission boundaries.
- `review-mode`: Add delegation- and turn-baseline review entry, visible navigation from agent evidence, and return navigation to the originating delegation.

## Impact

- `packages/shared`: Add delegation, execution, attention, evidence, context-bundle, isolation, lifecycle, and baseline protocol/domain types; extend ACP and PTY session snapshots with safe associations and continuity facts.
- `apps/server`: Add project-scoped delegation/evidence lifecycle services, cross-project attention summaries, safe persistence, confirmed process lifecycle operations, Git baseline and worktree management, and delegation-aware review coordination without introducing generic command execution.
- `apps/web`: Replace the Agents information architecture, session and creation surfaces, ACP turn rendering, PTY shell, composer, context dock, global attention, inspection transitions, lifecycle dialogs, responsive behavior, and keyboard/accessibility model.
- Local persistence: Introduce a versioned migration for safe delegation and evidence metadata. Existing ACP and PTY descriptors are adopted as unassigned legacy delegations without claiming historical intent or attribution.
- Git/workspaces: Isolated delegation roots remain children managed by explicit fixed server operations; every filesystem, ACP, PTY, reference, review, and terminal request continues through the selected execution workspace and safe resolver.
- Security and privacy: Permissions remain explicitly user-decided; no secrets or raw protocol streams are persisted; hidden-project attention is summary-only until the user switches project context.
- Product compatibility: Existing live processes survive mode changes and browser disconnects. Existing shared-checkout operation remains available but is clearly identified and cannot promise per-agent attribution.

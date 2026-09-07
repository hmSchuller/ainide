## Why

The agent workbench should make an active agent conversation pleasant to use, not turn every conversation into a durable project-management workflow. The recently proposed delegation model adds lifecycle, evidence, attention, context-transfer, and worktree concepts that are not needed for the core use case: running local sessions, supervising their conversation, seeing subagents, and reviewing the resulting work.

## What Changes

- **BREAKING** Remove the delegation-first work model introduced by `elevate-agent-workbench`; keep agent sessions as the primary user-facing unit.
- **BREAKING** Remove delegation-specific lifecycle, evidence ledger, global attention, managed worktree orchestration, delegation context bundles, delegation baselines, and delegation archive/integration flows unless an existing session feature already provides the behavior independently.
- Preserve explicit ACP and PTY session creation, project scoping, provider capabilities, permission decisions, workspace boundaries, restart behavior, and Review mode.
- Polish the active ACP conversation surface with clear message hierarchy, streaming presentation, stable bottom-follow behavior, readable tool activity, visible pending decisions, useful failure/reconnect states, and responsive layout.
- Improve the ACP composer with reliable draft behavior, Markdown, slash commands, `@` file references, keyboard submission, and explicit cancellation without adding a new delegation workflow.
- Display provider-reported subagents associated with the current conversation, including their name or role when available, current activity, and terminal state. Keep subagent information subordinate to the parent conversation and do not invent status when the provider does not report it.
- Keep session handoff user-driven: an active agent can produce a handoff prompt that the user may copy into another session. Do not add automatic cross-session context synchronization or persistent context contents.
- Preserve direct navigation from agent-reported files and diffs into Edit and Review, with a simple route back to the originating session.
- Retain the existing one- or two-session workbench layout, while making focus, comparison, session status, and mobile behavior clearer without introducing delegation terminology.

## Capabilities

### New Capabilities

<!-- No new capability is needed; this change simplifies and extends existing session and conversation behavior. -->

### Modified Capabilities

- `agent-workbench`: Restore session-centric navigation and polish the conversation workbench, including visible subagents and clearer session supervision.
- `acp-agent-sessions`: Improve ACP conversation rendering, composer behavior, subagent display, and recovery states without changing provider ownership or session boundaries.
- `review-mode`: Keep file and diff inspection connected to the originating agent session without adding delegation-specific review scopes.

## Impact

- `apps/web`: Simplify or remove delegation-oriented workbench UI and state, improve ACP conversation and composer components, display subagents, and refine Edit/Review navigation.
- `apps/server`: Remove unused delegation/evidence/attention/worktree orchestration introduced by the superseded workbench direction while retaining existing ACP, PTY, project, filesystem, permission, and review services.
- `packages/shared`: Remove or reduce delegation-only protocol types; add only the minimal provider activity shape needed to represent reported subagents if the current ACP model does not already carry it.
- Persistence: Stop depending on delegation snapshots and migration state; preserve existing session descriptor persistence and avoid storing transcript, handoff prompt, or context contents.
- Security and compatibility: Keep session-token checks, safe workspace resolution, real PTYs, explicit permission decisions, provider-specific capabilities, and existing session lifecycle behavior unchanged.

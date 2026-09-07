## Context

The existing application already owns local ACP and PTY processes, scopes sessions to projects and workspace roots, persists safe session descriptors, and provides Edit and Review modes. ACP activity is already delivered to the browser as structured session updates, while PTY output remains an opaque terminal stream. The prior `elevate-agent-workbench` direction adds a second delegation-oriented state model around those sessions; this change removes that layer instead of extending it.

The conversation surface also needs to work with provider differences. Some providers may report child-agent or subagent activity, while others will not. Generic tool output cannot safely be treated as proof that a subagent exists.

## Goals / Non-Goals

**Goals:**

- Make the existing session workbench feel polished while keeping sessions as the source of truth.
- Present ACP conversations with a clear primary narrative, readable secondary activity, stable streaming scroll behavior, and session-local recovery.
- Show provider-reported subagents without creating a second top-level session model or inferring unsupported state.
- Remove delegation-only browser state, server services, protocol types, persistence, and lifecycle UI introduced by the superseded direction.
- Keep existing ACP, PTY, project, filesystem, permission, provider-capability, reference-kit, and Review behavior working.

**Non-Goals:**

- Creating a new task, delegation, evidence, attention, archive, or cross-session context model.
- Managing, scheduling, stopping, or coordinating provider-owned subagents as independent ainide processes.
- Automatically transferring transcripts or context between sessions; handoff remains ordinary user-generated prompt text.
- Adding managed worktree creation, delegation baselines, automatic integration, or cleanup.
- Inferring agent progress, success, authorship, or subagent identity from PTY text or untyped provider activity.

## Decisions

### 1. Keep session state as the single product model

The existing ACP and PTY session records remain the identity, lifecycle, and persistence boundary. The workbench will continue to select one primary session and optionally show a second comparison session. New conversation presentation state, such as scroll position, expanded activity, and return location, stays browser-local and session-keyed.

This is preferred over retaining a reduced delegation aggregate because a second durable identity would preserve the complexity without solving a demonstrated user problem. A session title remains the lightweight way to describe purpose.

### 2. Remove delegation slices instead of adapting them

The implementation will identify and remove delegation-only stores, routes, snapshots, lifecycle commands, attention/evidence services, managed-worktree orchestration, and delegation-specific UI. Existing session APIs and shared types remain when they serve the established ACP/PTY workbench.

The cleanup will not delete files, branches, or worktrees as a side effect. Any local data created by the superseded direction is handled by a compatibility read or left recoverable for explicit user action; the application stops depending on it for normal session operation.

### 3. Build conversation polish as a browser presentation layer

ACP activity will remain transported and persisted according to the existing session behavior. The web client will group or visually relate activity around prompts without introducing durable delegation or evidence records. The primary hierarchy is user prompt and agent response, followed by collapsible tool, file, terminal, usage, and unknown activity.

Each ACP history owns its bottom-follow policy. Updates to an existing streamed message must trigger the same policy as appended activity. When the user reads older content, the viewport remains stable and a session-local `New activity` action returns to the latest content.

### 4. Normalize only explicitly reported subagents

Subagent display will use a minimal session-local view containing a provider-reported identity, optional role, optional current activity, and provider-reported state. A supported provider update or adapter may populate that view; unrecognized updates remain raw activity. Subagents render as compact secondary items inside the parent session and never become separate ainide sessions.

The UI will omit fields the provider does not supply. It will not parse terminal output, agent prose, or generic tool names to invent subagent records. No subagent control is added unless the provider already exposes a supported operation through the existing ACP boundary.

### 5. Preserve the existing prompt and handoff boundaries

The composer continues to own unsent text, slash commands, `@` file references, and reference-kit attachments. Selecting or attaching context does not submit a prompt. Cross-session handoff is intentionally not a platform data flow: the active agent can produce a handoff prompt, and the user explicitly copies it into another session.

This reuses proven behavior rather than introducing persistent context bundles, destination locks, freshness ledgers, or automatic synchronization.

### 6. Keep inspection navigation browser-local

Opening an agent-reported file or diff records the originating project, session, and relevant location in the existing browser state. Edit and Review remain the established inspection surfaces. Returning restores the prior session without requiring delegation ids, delegation baselines, or new server review scopes.

### 7. Test cleanup and UX separately

Server and shared tests will prove that delegation-only state is no longer required and that existing session persistence, workspace boundaries, permissions, and lifecycle behavior remain intact. Web tests will cover conversation hierarchy, stream updates, scroll-follow behavior, subagent association, session independence, composer recovery, and inspection return navigation. Provider fixtures will cover reported subagents and providers with no subagent support.

## Risks / Trade-offs

- [Removing a partially deployed delegation snapshot could hide local metadata] -> Stop writing delegation state, retain a compatibility reader for existing session descriptors, preserve unknown local files, and do not perform destructive cleanup automatically.
- [Provider subagent formats differ or are unavailable] -> Normalize only explicitly supported provider data and show ordinary activity when no reliable subagent identity exists.
- [A polished hierarchy could hide useful raw details] -> Keep ordered activity inspectable and make secondary sections expandable without making them the default visual focus.
- [Streaming layout changes can cause scroll jumps] -> Keep scroll ownership per ACP history, react to content updates as well as list changes, and provide an explicit return-to-latest action.
- [Removing delegation code may break unrelated session behavior] -> Separate deletion by delegation-only dependency, preserve existing session APIs, and run the full session, persistence, security, and build verification before rollout.
- [Existing managed worktrees may be valuable to the user] -> Never delete or reset branches/worktrees during cleanup; leave them recoverable and independent of the simplified session UI.

## Migration Plan

1. Inventory delegation-only state, routes, types, persistence fields, UI components, and tests introduced by `elevate-agent-workbench`.
2. Stop creating or requiring delegation records while preserving the existing ACP/PTY session snapshot format and safe session restoration.
3. Remove delegation-first creation, navigator, lifecycle, attention, evidence, worktree, and baseline paths without deleting user workspace data.
4. Implement the conversation-first presentation, subagent display, session-local recovery states, and inspection return navigation over the existing session APIs.
5. Run migration, persistence, security, ACP/PTY lifecycle, provider-variation, accessibility, responsive, and end-to-end checks.

Rollback is a web/server deployment rollback to the prior session implementation. No provider session, workspace file, branch, or worktree is automatically deleted as part of this change.

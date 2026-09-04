# Add ACP Session Rollover and Resume

## Why

The ACP workbench treats a started agent as a one-way street: when a conversation goes off the rails or a task is done, the user must close the agent and start over to get a fresh context, and conversations the provider already recorded (for example opencode's session history) are unreachable from ainide. The ACP protocol already hands the client what it needs — `session/new` on a live connection, `session/list`, and `session/load` with full transcript replay — and both installed providers were probed: opencode serves a real session list and replays loaded transcripts; cursor advertises the same surface (currently empty).

## What Changes

- The ACP composer gains a client-side `/new` command: selecting it rolls the focused session over to a fresh provider context on the same provider process — same workbench card, new provider session, fresh transcript — while the previous context is released, not deleted, and remains resumable in the provider's own store.
- The new-agent picker grows a recent-sessions section per provider (when the provider advertises session listing), showing workspace-scoped recent provider sessions with provider title and recency; picking one starts that provider and loads that session, with the provider replaying the past transcript.
- Rolled-over and resumed sessions persist through the existing descriptor path so standard restart restoration keeps working.

Non-goals: session deletion, forking, mode switching, cross-workspace browsing, and any provider-side session management beyond list and load.

## Capabilities

### Modified Capabilities

- `acp-agent-sessions`: the new-agent picker presents recent resumable sessions alongside start-new entries; the composer gains an executing client command (`/new`) alongside insert-style provider commands; the server gains rollover (new provider session on the existing connection) and load-by-provider-session-id session creation.

## Impact

- `packages/shared`: a provider-session summary type and an optional load target on ACP session creation.
- `apps/server`: ACP manager rollover method and load-path in session creation, a `session/list` route served by a transient provider process with caching and timeout, a `canList` capability, and one rollover route.
- `apps/web`: composer client-command kind and `/new` execution, picker recent-sessions section, store wiring.

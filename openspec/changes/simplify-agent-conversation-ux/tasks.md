## 1. Scope And Compatibility Inventory

- [x] 1.1 Inventory delegation-only stores, routes, shared types, persistence fields, UI components, and tests introduced by `elevate-agent-workbench`; verify the inventory labels each item for removal, retention, or compatibility handling.
- [x] 1.2 Inspect the supported ACP update shapes and define the minimal provider-reported subagent view; verify fixtures cover a provider with subagents and a provider without subagent data.

## 2. Restore The Session-Centric Model

- [x] 2.1 Remove delegation-first creation, navigation, lifecycle, archive, and outcome UI while retaining the existing ACP/PTY session picker, titles, project scoping, and one- or two-session layout; verify existing workbench session tests pass.
- [x] 2.2 Remove delegation registry, evidence, global attention, managed-worktree, baseline, and delegation-review server wiring that is not required by existing session behavior; verify existing ACP, PTY, project, and Review API tests pass.
- [x] 2.3 Remove delegation-only shared protocol types and live-state dependencies while retaining session-token, workspace-boundary, permission, and provider-capability contracts; verify `npm run typecheck` passes.
- [x] 2.4 Stop writing or requiring delegation snapshots and preserve the existing safe session descriptor format; verify restart fixtures restore ACP/PTY sessions without delegation adoption and without persisting secrets, transcript content, or handoff prompts.
- [x] 2.5 Ensure cleanup does not delete or reset files, branches, or worktrees created by the superseded direction; verify cleanup tests show those resources remain untouched.

## 3. Polish The ACP Conversation Surface

- [x] 3.1 Render ACP activity around each prompt and response with readable hierarchy for messages, tools, files, terminal activity, usage, unknown updates, and completion while retaining ordered inspection; verify mixed-activity conversation tests pass.
- [x] 3.2 Preserve streamed messages in place and implement per-session bottom-follow behavior with a `New activity` affordance when the user reads older content; verify appended and coalesced streaming updates do not cause unwanted jumps.
- [x] 3.3 Improve session-local presentation of pending permissions, authentication, structured input, cancellation, provider failure, reconnecting, and exited states; verify no permission is auto-approved and each recovery action affects only its session.
- [x] 3.4 Polish the composer while preserving existing slash-command autocomplete, `@` file references, reference-kit behavior, keyboard submission, IME handling, optimistic draft recovery, and explicit cancellation; verify existing composer and draft tests remain green.
- [x] 3.5 Refine responsive and accessible conversation presentation, including visible focus, logical action order, bounded announcements, and usable narrow-screen behavior; verify component accessibility and representative viewport checks.

## 4. Display Provider-Reported Subagents

- [x] 4.1 Normalize supported provider-reported subagent updates into the selected parent session without creating separate ainide sessions or inferring identity from arbitrary text; verify parent association, unknown-update, and provider-without-subagents tests.
- [x] 4.2 Render compact subordinate subagent items with available identity, role, current activity, and state; verify multiple subagents remain distinct and updates to one do not alter another or the parent conversation.
- [x] 4.3 Preserve honest subagent state and supported inspection details across browser reconnect and session switching; verify unavailable fields are omitted and no unsupported subagent controls appear.

## 5. Keep Inspection And Handoff Simple

- [x] 5.1 Preserve direct agent file and diff navigation into the existing Edit and Review surfaces with browser-local return context keyed to the originating session; verify returning restores the session without starting or stopping a process.
- [x] 5.2 Keep cross-session handoff as ordinary user-managed prompt text and remove automatic context synchronization or delegation context bundles; verify a copied handoff prompt is not persisted or sent to another session without explicit user submission.

## 6. Integrated Verification And Release

- [x] 6.1 Add integrated coverage for multiple ACP/PTY sessions, streaming and scroll behavior, permissions, provider failure, provider-reported subagents, session independence, file/diff inspection, and explicit handoff prompts; verify the end-to-end scenarios pass.
- [x] 6.2 Run focused security checks for session tokens, workspace path boundaries, permission cancellation, persistence exclusions, and cleanup non-destructiveness; verify rejected operations have no filesystem or process side effects.
- [x] 6.3 Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; verify no delegation-only behavior remains required for the session workbench.

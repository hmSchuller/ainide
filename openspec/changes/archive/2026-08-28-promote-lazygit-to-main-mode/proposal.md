## Why

The current top-level navigation places Agents between Edit and Review even though the existing mode shortcuts and workflow imply `Edit -> Review -> Agents`. Those numeric shortcuts also collide with browser tab switching, while Lazygit remains hidden inside terminal utilities instead of having a focused workspace surface.

This change makes the mode model explicit: code editing, Git review, agent supervision, and interactive Git operations each have a clear home. It also removes non-agent terminal controls from Agents so that parallel agent supervision is not mixed with unrelated utility sessions.

## What Changes

- Order the primary tabs as `Edit`, `Review`, `Agents`, and `LazyGit`.
- Remove direct numeric mode shortcuts and their tab or command-palette labels; mode changes remain available through clickable tabs and the command palette.
- Add LazyGit as a standalone, full-height primary mode backed by the existing project-scoped Lazygit PTY.
- Keep Lazygit out of the Edit utility footer and out of the Agents workbench.
- Remove shell, custom, and other utility-session launchers from Agents; Agents becomes an agent-session-only workbench.
- Keep shell and custom utility terminals in Edit only; Review remains focused on the Difit surface without a utility footer.
- Preserve PTY survival, active-project scoping, optional-tool error handling, and existing session restoration behavior.
- Persist and restore the new LazyGit mode in project session snapshots without adding terminal output, process identifiers, or secrets to snapshots.

## Capabilities

### New Capabilities

- `lazygit-mode`: Dedicated primary navigation, full-height terminal presentation, session reuse, availability handling, and project-scoped restoration for Lazygit.

### Modified Capabilities

- `agent-workbench`: Agents mode no longer exposes shell, custom, or Lazygit utility sessions; it presents agent sessions only.
- `review-mode`: Review mode remains a Difit-only surface and no longer renders the utility terminal footer.

## Impact

- `packages/shared`: Extend `AppMode` and snapshot validation for LazyGit mode.
- `apps/web/src/App.tsx`: Reorder mode navigation, remove numeric shortcuts, route command-palette navigation, and render the LazyGit surface.
- `apps/web/src/components`: Add the LazyGit surface and simplify `AgentWorkbench` and `TerminalPanel` ownership.
- `apps/web/src/store.ts`, `project-ui.ts`, and session tests: Preserve mode state and project-scoped terminal behavior through switching and restoration.
- `apps/server/src/sessions.ts` and `server.ts`: Accept and sanitize the new mode while retaining existing PTY lifecycle and authentication boundaries.
- `apps/web/src/styles.css`, README, and focused tests: Support the fourth tab, responsive presentation, and updated utility ownership.
- No new cloud service, generic command endpoint, or terminal protocol is required.

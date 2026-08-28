## 1. Shared Mode And Snapshot Contracts

- [x] 1.1 Extend the shared `AppMode` contract to include `lazygit` and verify all workspace packages type-check with the new mode.
- [x] 1.2 Update client project bags, server snapshot parsing, patch validation, and sanitization to round-trip `lazygit` while preserving the existing fallback for older snapshots; verify snapshot tests cover all four modes and unknown-mode fallback.
- [x] 1.3 Preserve the existing snapshot secret policy for LazyGit mode and verify serialized snapshots contain no commands, terminal output, PIDs, PTY identifiers, session tokens, or reference-kit contents.

## 2. Primary Navigation

- [x] 2.1 Render primary mode controls in the order Edit, Review, Agents, and LazyGit and verify a navigation test or DOM inspection confirms the order and active-state behavior.
- [x] 2.2 Remove numeric mode key handlers and numeric shortcut labels from the tabs and command palette, keeping clickable tabs and command-palette actions; verify `Cmd/Ctrl+1..4` are not registered as application mode commands.
- [x] 2.3 Route the LazyGit tab and command-palette action through one mode-entry path that reuses or starts the appropriate active-project session; verify repeated navigation does not create duplicate Lazygit sessions.
- [x] 2.4 Update responsive mode-strip styling for four tabs with no shortcut metadata and verify the controls remain usable at desktop and mobile widths.

## 3. LazyGit Surface

- [x] 3.1 Add a dedicated full-height LazyGit surface that renders the active project's Lazygit terminal through the existing terminal view and verify it is not nested in the utility footer.
- [x] 3.2 Display a clear empty, unavailable, or exited state for missing or terminated Lazygit sessions, with an explicit retry or restart path where applicable; verify optional-tool failure does not render as a successful blank surface.
- [x] 3.3 Preserve access to any existing same-kind Lazygit sessions without blindly creating new ones and verify a session created by an older UI state is not silently orphaned.
- [x] 3.4 Verify LazyGit terminal output, process identity, and scrollback remain available after switching between LazyGit and each other primary mode.

## 4. Terminal Ownership By Mode

- [x] 4.1 Remove the Agents workbench Tools section, utility launchers, and related callbacks so Agents displays only active-project agent sessions; verify shell, custom, and Lazygit sessions are absent from Agents.
- [x] 4.2 Restrict the utility terminal panel to shell and custom sessions and render it only in Edit mode; verify Edit retains utility terminal access and Review has no terminal footer.
- [x] 4.3 Ensure Lazygit is excluded from both the Edit utility panel and Agents while remaining available only through its primary mode; verify no terminal kind has two visible mode owners.
- [x] 4.4 Update terminal error, close, selection, and restart affordances for the new ownership boundaries and verify utility-session actions still work from Edit without affecting agent or Lazygit sessions.

## 5. Project Scope And Lifecycle

- [x] 5.1 Preserve active-project filtering for LazyGit rendering and WebSocket attachment, and verify a hidden project's Lazygit session cannot appear or receive input from another project's mode.
- [x] 5.2 Verify switching among Edit, Review, Agents, and LazyGit preserves live PTYs and does not duplicate, terminate, or replace sessions.
- [x] 5.3 Verify restoring a project whose saved mode is LazyGit opens the LazyGit surface and follows the existing best-effort terminal recreation behavior when the process has restarted.

## 6. Verification And Documentation

- [x] 6.1 Add focused web tests for mode order, absence of numeric shortcuts, LazyGit surface visibility, utility ownership, unavailable-tool handling, and session reuse.
- [x] 6.2 Add or update server and shared tests for LazyGit mode snapshot parsing, sanitization, restoration, and active-project terminal isolation.
- [x] 6.3 Update README usage, mode descriptions, optional-tool notes, and troubleshooting text to describe LazyGit as a standalone mode and shell/custom terminals as Edit-only utilities; verify documentation matches the implemented navigation.
- [x] 6.4 Run `npm run typecheck`, `npm test`, and `npm run build` from the repository root and resolve failures introduced by this change.
- [x] 6.5 Exercise the acceptance matrix: four tabs in the specified order, no numeric mode shortcuts, LazyGit full-height operation, Agents-only agents, Edit-only utilities, Review-only Difit, project isolation, and session survival; record the result in this task file.

### Acceptance matrix (2026-08-28)

| Check | Result | Evidence |
| --- | --- | --- |
| Four tabs in order Edit → Review → Agents → LazyGit | Pass | `navigation.test.ts`, `App.tsx` `PRIMARY_MODES` |
| No numeric mode shortcuts | Pass | Removed key handlers and tab/palette labels; `navigation.test.ts` |
| LazyGit full-height surface | Pass | `LazyGitSurface.tsx`, not rendered via `TerminalPanel` |
| Agents-only agents | Pass | `AgentWorkbench.tsx` tools section removed |
| Edit-only shell/custom utilities | Pass | `terminal-ownership.ts`, `terminalPanelVisible("edit")` |
| Review-only Difit | Pass | `terminalPanelVisible("review") === false` |
| Project isolation | Pass | `terminal-ownership.test.ts`, existing server terminal-owner test |
| Session survival / reuse | Pass | `terminal-ownership.test.ts`, `switchToLazyGit()` reuse path |
| Snapshot round-trip for `lazygit` mode | Pass | `sessions.test.ts`, `server.test.ts` lazygit restore |
| Verification commands | Pass | `npm run typecheck`, `npm test`, `npm run build` all succeeded |

## Context

See `proposal.md` for the motivation and the delta specs for the observable behavior. The current web shell stores three modes in the shared `AppMode` union. `App.tsx` renders Edit, Agents, and Review surfaces, while `TerminalPanel` renders every active-project non-agent terminal below Edit and Review. `AgentWorkbench` separately renders agent sessions and a Tools section for shell, Lazygit, and custom sessions.

Lazygit is already a validated terminal kind. The server starts it as a real PTY, scopes it to the active workspace, reports its lifecycle, and records its kind in project snapshots. `TerminalView` owns the browser WebSocket attachment and can be reused by another surface. No new process protocol or command-execution API is needed.

The current project snapshot and server validation accept only `edit`, `agents`, and `review` as modes. The current mode keydown handler handles `Cmd/Ctrl+1..3` without cancelling browser tab navigation, and the mode labels do not match the shortcut order.

## Goals / Non-Goals

**Goals:**

- Establish one canonical primary-mode order and one navigation mechanism that does not compete with browser tab shortcuts.
- Give Lazygit a dedicated full-height surface while reusing its existing PTY and active-project security boundary.
- Make terminal ownership mutually exclusive: Edit owns shell/custom utilities, Review owns Difit, Agents owns agents, and LazyGit owns Lazygit.
- Preserve terminal process identity, scrollback attachment, project switching behavior, optional-tool failures, and snapshot safety.
- Keep the fourth tab usable at desktop and mobile widths without adding a new dependency.

**Non-Goals:**

- Changing how Lazygit itself behaves or adding Git operations to the HTTP API.
- Adding direct keyboard shortcuts for primary modes; clickable tabs and the command palette are the supported navigation paths.
- Showing shell, custom, or Lazygit sessions in the Agents workbench.
- Keeping a utility terminal footer in Review mode.
- Introducing a second PTY implementation, global cross-project terminal view, or cloud integration.

## Decisions

### 1. Represent LazyGit as an AppMode, not a new TerminalKind

**Choice:** Add `lazygit` to the shared application mode union while retaining `lazygit` as the existing terminal kind. The mode identifies the visible surface; the terminal kind identifies the PTY process behind it.

**Rationale:** The server already knows how to create, scope, restore, and authenticate Lazygit sessions. Reusing that contract avoids duplicating process lifecycle code or introducing a mode-specific WebSocket protocol.

**Alternative:** Replace the terminal session with a Git-specific server resource. Rejected because it would duplicate terminal lifecycle behavior and violate the existing local PTY boundary.

### 2. Use explicit tabs and the command palette instead of numeric shortcuts

**Choice:** Render the primary controls in the order `Edit`, `Review`, `Agents`, `LazyGit`. Remove the global `Cmd/Ctrl+1..4` handling and all numeric shortcut labels. Both tab clicks and command-palette actions set the same mode state; entering Review continues through its existing asynchronous status-first flow.

**Rationale:** `Cmd/Ctrl+1..4` are browser tab-selection accelerators and cannot be made reliably application-owned across browsers. Removing them is more predictable than attempting to cancel a browser-level action. Keeping one visible order prevents the previous Agents/Review mismatch.

**Alternative:** Add `preventDefault()` to the existing number handler. Rejected because browser-reserved accelerators are not consistently cancelable and the UI would still teach a conflicting shortcut.

### 3. Give LazyGit a dedicated surface built around TerminalView

**Choice:** Add a small `LazyGitSurface` component that selects the active project's Lazygit sessions and renders their terminal view in the main-column work area. It may retain a compact session header for any existing same-kind sessions, but it must not use the bottom utility-panel layout. The surface shows clear unavailable or exited states and offers an explicit retry path where appropriate.

**Rationale:** `TerminalView` already handles xterm rendering, WebSocket authentication, scrollback attachment, links, resize, and exit state. A separate surface changes presentation and ownership without changing terminal behavior.

**Alternative:** Add a mode flag to `TerminalPanel` and make the existing footer fill the main area. Rejected because footer-specific sizing, shell/custom filtering, collapse controls, and selection behavior would remain coupled to a primary surface.

### 4. Make terminal ownership a mode-level filter

**Choice:** Filter the Edit utility panel to shell and custom sessions only, render that panel only while Edit is active, remove the Agents Tools section and its tool launch callbacks, and render only Lazygit sessions from `LazyGitSurface`. Review renders no utility panel.

**Rationale:** A mode should have one obvious purpose and one owner for each terminal kind. Filtering at the presentation boundary preserves existing terminal records and PTYs while preventing duplicate visual ownership.

**Alternative:** Delete or stop non-agent sessions when leaving Agents. Rejected because mode changes must not terminate live PTYs and hidden projects must retain their sessions.

### 5. Preserve eager optional-terminal reconciliation

**Choice:** Keep the existing default terminal-kind reconciliation and snapshot representation for Lazygit. When a project is opened or restored, the current lifecycle may create one default Lazygit PTY as it does today. Entering LazyGit mode reuses a live matching session instead of creating another one. If Lazygit is unavailable, the mode remains navigable and reports the failure in its dedicated surface.

**Rationale:** This minimizes migration risk and preserves the existing behavior documented by project-session restoration. Promoting the visual surface does not require changing when the optional process is started.

**Alternative:** Start Lazygit only when its mode is selected. Rejected for this change because it would alter default-terminal reconciliation, restoration semantics, and optional-tool startup behavior beyond the requested presentation change.

### 6. Extend mode validation without changing snapshot secrets policy

**Choice:** Update shared mode types, client project bags, server snapshot patch validation, and disk snapshot parsing/sanitization to accept `lazygit`. Continue storing only the selected mode and existing terminal-kind metadata. Keep output, commands, PIDs, PTY identifiers, tokens, and reference-kit content excluded.

**Rationale:** Mode restoration must round-trip the fourth mode, while the existing snapshot privacy boundary remains sufficient.

**Alternative:** Store a separate `lastPrimaryMode` field or a Lazygit session ID. Rejected because the existing `mode` field and kind-based restoration already provide the needed behavior without persisting transient process identity.

### 7. Treat existing in-memory duplicate Lazygit sessions conservatively

**Choice:** Normal mode entry reuses the first suitable active-project Lazygit session and does not create duplicates. The surface may expose existing Lazygit sessions through a small session selector so sessions created by older UI versions are not silently orphaned. New mode navigation replaces the old command-palette action that blindly created another Lazygit terminal.

**Rationale:** The generic terminal API permits multiple sessions, and an already-running server may contain sessions created before this change. Reuse avoids new duplication while retaining access to existing session state.

**Alternative:** Enforce a server-wide one-Lazygit-session invariant. Rejected because it would impose a new restriction on the generic terminal manager and complicate active-project and restart behavior.

## Risks / Trade-offs

- **[Browser shortcut expectations]** Users lose numeric mode shortcuts → clickable tabs and command-palette mode actions remain explicit and reliable.
- **[Optional dependency missing]** The fourth tab can open to an unavailable state → keep the tab visible and show an actionable install message instead of hiding the capability.
- **[Stale exited sessions]** A dead Lazygit session may remain in the session list → preserve its output and provide an explicit restart/close path rather than silently replacing it.
- **[Mode surface hidden mounts]** Existing mode surfaces may remain mounted while hidden, which can attach terminal views outside the active surface → keep all attachment checks project-scoped and ensure only the active mode owns visible controls; verify browser resource behavior during acceptance testing.
- **[Mobile navigation width]** Four tabs compete with the project switcher and actions → allow the mode strip to shrink or scroll and hide only nonessential shortcut metadata, of which there will be none.
- **[Concurrent existing UI work]** The uncommitted edit-surface polish work also changes `App.tsx`, `TerminalPanel`, and related state → apply this change after reconciling those edits and update the pending terminal-utility requirements rather than overwriting them.

## Migration Plan

1. Deploy shared type and snapshot validation changes with the web and server changes so a saved `lazygit` mode is accepted by both sides.
2. Keep old snapshots without the new mode value valid; they continue restoring to Edit, Agents, or Review as before.
3. Preserve existing Lazygit terminal-kind restoration. A running server reuses its current PTY; a process restart recreates it through the existing best-effort optional-tool path.
4. On rollback, an older client can ignore the new mode only if the server snapshot is not opened in that client; otherwise restore behavior should default unknown modes to Edit through existing sanitization. No file or database migration is required.

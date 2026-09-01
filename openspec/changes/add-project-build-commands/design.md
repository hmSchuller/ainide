# Design: add project build commands

## Context

See proposal.md for motivation. Current state that shapes this design:

- Per-project settings live in the global config file (`apps/server/src/config.ts`) as a `projects` map keyed by absolute root path; today it holds `disabledAgents`. Reads/writes go through session-token-checked Fastify routes that identify the project by `rootPath` in the body/query (`GET`/`PATCH /api/project/agents`, `apps/server/src/server.ts:404-434`).
- PTY sessions are created in `apps/server/src/terminals.ts`. `create()` already spawns `shell -lc <command>`, but resolves the command to shell/agent/lazygit only — the client-supplied `command` field is ignored (line 50). Kinds are a shared union (`TerminalKind`, `packages/shared/src/index.ts:74`) and every kind switch lives on both sides of the API.
- The top bar is rendered inline in `apps/web/src/App.tsx` (project switcher, mode tabs, top actions). Project settings are a modal dialog (`ProjectAgentSettingsDialog.tsx`) opened from the project switcher.
- The terminal utility panel renders per-session tabs filtered by `UTILITY_TERMINAL_KINDS = ["shell", "custom"]` (`apps/web/src/terminal-ownership.ts:3`) and is shown only in Edit mode (`layout-prefs.ts`). Each visible session keeps its own WebSocket open, and an `exit` message flips `alive` to false in the store.
- `TerminalSession` already carries `command: string` and `title: string`, and the panel already prints `[process exited with N]` on exit — no protocol additions are needed for exit reporting.

## Goals / Non-Goals

**Goals:**

- Build commands are a first-class per-project setting edited in the existing settings dialog and run from the top bar in all modes.
- A run reuses the existing PTY + terminal-panel machinery with the smallest possible protocol surface.
- The whole feature is backward compatible: existing config files, sessions, and panel behavior keep working unchanged.

**Non-Goals:**

- No variable interpolation, per-command env/args, parallel builds, or output parsing (see proposal).
- No new WebSocket message types and no new shared types for session state.
- No per-workspace config file (no `.ainide/` inside the project directory).

## Decisions

### 1. Store `buildCommands` in the existing per-project config entry

`AinideConfig.projects` gains `buildCommands?: BuildCommand[]` where `BuildCommand = { label: string; command: string }`, next to `disabledAgents`. Validation limits: at most 20 entries, label 1–80 chars (80 matches the existing terminal-title limit), command 1–500 chars, all trimmed, non-empty.

- **Alternative considered:** a per-workspace file inside the project directory. Rejected — inconsistent with where `disabledAgents` lives, would need its own safe-resolver read/write path, and would create git noise in user projects.
- **Alternative considered:** flat command strings without labels. Rejected — the dropdown and session titles need human-readable names that survive command edits.

### 2. Mirror the agent-settings endpoints

`GET /api/project/builds` (query `projectId`, defaults to active) and `PATCH /api/project/builds` (body `{ rootPath, commands }`), modeled on the agents routes: same rootPath-in-body convention (so paths with spaces/unicode/`__proto__` work), same unknown-project rejection, same "replace the whole list" semantics, same immediate `saveConfig()` persistence. A blank entry or oversized list rejects the whole update with 400, leaving the stored list unchanged.

- **Alternative considered:** one unified `/api/project/settings` endpoint. Rejected — it would either duplicate the existing agents endpoints or force a migration; mirroring keeps each surface independent and matches the established pattern.

### 3. New `"build"` terminal kind that honors `command`

`TerminalKind` becomes `"agent" | "shell" | "lazygit" | "custom" | "build"`. In `terminals.create()`, kind `"build"` requires a non-empty string `command` (400 otherwise) and spawns `shell -lc <command>` — the same spawn path used for agent sessions, with `cwd` = project root. `session.command` stores the build command, `session.title` is the label (with the existing 80-char limit).

- **Alternative considered:** reuse `"custom"` with a command. Rejected — `custom` currently means "plain shell"; silently changing its semantics would surprise existing code paths that branch on kind.
- **Alternative considered:** direct spawn with argv parsing. Rejected — build commands are shell lines (env assignments, `&&`, pipes); a login shell is exactly what typing in a terminal gives, and the spawn helper already exists.
- **Alternative considered:** create a shell session and send the command as input. Rejected — leaves an interactive shell alive after the build, muddies exit codes, and races with attach.

Server-side one-at-a-time enforcement: `create()` for kind `"build"` returns 409 if a live `"build"` session already exists for that project. The UI enforces the same rule (see decision 4); the server check makes the API honest for non-UI clients.

**Kind switch audit (implementation must touch all of these):** `terminal-ownership.ts` — add `"build"` to `UTILITY_TERMINAL_KINDS` so build sessions appear as panel tabs; `titleFor(kind)` in `terminals.ts`; agents-mode counts in `App.tsx` (must not count builds as agents); `shouldShowReferenceDock`/layout code is unaffected. Any new `switch` on `TerminalKind` must handle the new value.

### 4. Runner state is derived, not stored

The top-bar runner keeps no server-side state beyond the command list. In the web store:

- `buildCommands: BuildCommand[]` for the active project, loaded when the project becomes active (same trigger as the settings dialog load) and refreshed after a settings save.
- Last selection per project: `localStorage` map `ainide:build-selections` (`{ [projectId]: label }`), same pattern as `ainide:explorer-width`. Selection = remembered label if it still exists, else the first defined command.
- The live build is derived from the existing `terminals` list: `terminals.find(t => t.projectId === active && t.kind === "build" && t.alive)`.

Button states:

| Condition | Control | Action |
|---|---|---|
| No live build | ▶ (disabled if no commands) | start selected command |
| Live build (any) | ⏹ | `DELETE /api/terminals/:id` on the running build; session remains as an exited tab |

While a build is alive the control is always the stop for that session, regardless of the dropdown selection — the user can never be locked out of stopping it, and starting a different command is blocked by both the UI (no start state while alive) and the server (409). Starting a build expands the panel if collapsed (normal collapse setter, so the persisted preference follows, same as a manual expand) and sets the new session as the active terminal tab.

The runner reacts to process exit through the existing `alive` flag updates that mounted `TerminalView`s apply from `exit` messages. This is why the panel must stay rendered in all modes (decision 5): a hidden-in-DOM panel still mounts session views and keeps their sockets open.

### 5. Terminal panel visible in all primary modes

`terminalPanelVisible(mode)` returns true for every mode (function and its unit tests stay; the LazyGit/Agents/Review layout keeps the panel as the bottom dock under the mode surface, per the spec delta). No mode-switching happens on run — the user stays where they are.

- **Alternative considered:** auto-switch to Edit on run. Rejected — disruptive during agent conversations and review; the panel fits as a dock in every mode.
- **Alternative considered:** a mode-scoped "build console" surface instead of the panel. Rejected — duplicates terminal machinery for one extra surface.

### 6. Settings dialog gains a "Build commands" section

`ProjectAgentSettingsDialog` (renamed in usage only; component file may keep its name or move to a shared project-settings file) gets a second section below Agents: rows of `[label input][command input][remove]`, an add row, and the dialog's existing Done/save action now persists both sections (two PATCHes, same token). Draft state is local to the dialog; saving with an invalid row shows an error notice instead of persisting (server is the final validator either way).

### 7. Empty state

No commands: dropdown disabled with a hint ("No build commands — project settings"); the hint is clickable and opens the existing project settings dialog, which already has the new section. Run control disabled.

## Risks / Trade-offs

- [Kind switch audit misses a branch] → `"build"` silently misbehaves in one mode or tab list. Mitigation: grep-level audit task enumerating every `TerminalKind` usage before code, plus a typecheck gate since the union is shared.
- [Runner depends on panel-mounted sockets for exit updates] → if a future change unmounts session views when the panel is collapsed, the stop button would never revert. Mitigation: the layout-prefs spec delta pins the panel to all modes; a test asserts a live build's exit is observed while the panel is collapsed.
- [LazyGit mode loses vertical space under the dock] → the TUI gets shorter when the panel is expanded. Accepted: the panel is user-collapsible and collapsed by default; the build console is the point.
- [`shell -lc <command>` exit code is the shell's last command exit] → matches typing the command in a terminal, which is the behavior users expect; no mitigation needed.
- [Two entries with the same command string] → the runner treats the running session by its stored command; both dropdown entries map to the same running build. Acceptable; dedup is not enforced (a user may legitimately want two labels for one command).
- [Panel visible in Agents mode changes that mode's layout] → spec delta and test updates required; accepted as the enabler for watching builds during agent conversations.

## Migration Plan

No data migration. `buildCommands` is an optional field — old configs load unchanged, `saveConfig()` round-trips the new field, and `loadConfig()` ignores it when absent (empty list). Rollback is a normal revert; the config field, if written, is inert to older server versions (unknown per-project keys are preserved by the existing save path, which serializes the whole `projects` map — verify this holds during implementation; if the loader drops unknown keys, adjust the loader to pass `buildCommands` through).

## Open Questions

None — selection limits (20 entries, 80/500 char caps) are the only remaining tuning knobs and are recorded above.

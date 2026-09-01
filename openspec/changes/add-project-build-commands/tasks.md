# Tasks: add project build commands

## 1. Shared types

- [x] 1.1 Add `"build"` to `TerminalKind` in `packages/shared`, add a `BuildCommand` type (`{ label: string; command: string }`) and request/response types for the builds settings API, and verify `npm run typecheck` passes across all packages
- [x] 1.2 Audit every usage of `TerminalKind` (server `switch`es, `titleFor`, `listAliveKinds`, web `UTILITY_TERMINAL_KINDS`, agents-mode counts) and record the touch points, verified by a grep over `apps/` and `packages/` for the kind literals with no unhandled branch left

## 2. Server: configuration

- [x] 2.1 Add `buildCommands` to the per-project config entry in `apps/server/src/config.ts` with load-time validation (array of `{ label, command }`, trimmed, ≤20 entries, label 1–80 chars, command 1–500 chars) and a `saveConfig()` round-trip, verified by a unit test that loads and saves a config with build commands for a root path containing spaces, non-ASCII, and `__proto__`
- [x] 2.2 Verify backward compatibility with a unit test: a config file without `buildCommands` loads as an empty list per project, and saving such a config does not corrupt existing per-project fields

## 3. Server: builds settings API

- [x] 3.1 Implement `GET /api/project/builds` (query `projectId`, defaults to active project, 409 when no active project, 404 for unknown explicit project) mirroring the agents route, verified by a route test covering the default and explicit project cases
- [x] 3.2 Implement `PATCH /api/project/builds` (body `{ rootPath, commands }`) with whole-list replacement, unknown-project rejection, rejection of blank entries and of lists/entries over the limits (existing list unchanged on rejection), and immediate persistence, verified by route tests including a root path with special characters and each rejection case

## 4. Server: build terminal kind

- [x] 4.1 Extend `terminals.create()` to accept kind `"build"`: require a non-empty `command` string (400 otherwise), spawn `shell -lc <command>` with the project root as cwd, store the command in `session.command` and the supplied title (label) in `session.title`, verified by a test that the spawned session runs a command (observable via output/exit) and a 400 test for a missing command
- [x] 4.2 Enforce one live build per project server-side: `create()` for kind `"build"` returns 409 while a live build session exists for that project, verified by a test that starts a build and confirms a second creation is rejected until the first exits
- [x] 4.3 Update `titleFor` and any other server-side kind handling from the 1.2 audit for `"build"`, verified by `npm run typecheck` and the existing terminal test suite passing

## 5. Web: terminal panel in all modes

- [x] 5.1 Make `terminalPanelVisible` return true for every primary mode in `layout-prefs.ts` and update its unit tests, verified by the layout-prefs test suite passing for edit/review/agents/lazygit
- [x] 5.2 Add `"build"` to `UTILITY_TERMINAL_KINDS` in `terminal-ownership.ts` so build sessions appear as utility-panel tabs, verified by a unit test on `utilityTerminals` filtering a mixed-kind list

## 6. Web: top-bar build runner

- [x] 6.1 Add runner state to the web store: active-project `buildCommands` loaded on project activation and after settings saves, plus per-project last selection persisted in `localStorage` (`ainide:build-selections`, remembered label if still defined else first), verified by unit tests for the selection-resolution rule and per-project isolation
- [x] 6.2 Render the dropdown + run control in the top bar (visible in all modes): dropdown lists labels in definition order, disabled with a clickable hint opening the project settings dialog when the list is empty, run control disabled in that state, verified by a component test for the empty state and a manual check in each mode
- [x] 6.3 Implement start: create a `"build"` terminal via the existing terminals API with the selected command and label as title, expand the panel if collapsed, and focus the new session tab, verified by a manual run in Edit and in Agents mode showing the focused build output
- [x] 6.4 Implement stop and derived button states: while any build session is alive the control is ⏹ acting on that session (`DELETE /api/terminals/:id`, session remains as an exited tab); otherwise ▶ starts the selection, verified by a manual run: start a build, stop it, confirm the control reverts and the tab remains, and confirm the control reverts automatically when a build exits on its own with the panel collapsed

## 7. Web: settings dialog section

- [x] 7.1 Add a "Build commands" section to the project settings dialog: rows of label + command inputs with remove, an add row, and validation that blocks saving an invalid row with an error notice, verified by a component test covering add/edit/remove and a blocked invalid save
- [x] 7.2 Persist the section on the dialog's save action via `PATCH /api/project/builds` alongside the existing agents save, and refresh the top-bar list on success, verified by a manual run: save a new command and see it appear in the dropdown without reloading

## 8. Integration verification

- [x] 8.1 End-to-end run: define two commands for a project, run one and observe output and the exit-code report, stop the other mid-run, and switch projects to confirm per-project lists and selections are isolated, verified manually against the scenarios in `specs/project-build-commands/spec.md`
- [x] 8.2 Restart the server with a saved `buildCommands` list and confirm the commands survive and still run, and load a config file without the field to confirm empty-list behavior, verified manually

## 9. Final gates

- [x] 9.1 Run `npm run typecheck`, `npm test`, and `npm run build` from the repository root and verify all pass with the existing suites unbroken

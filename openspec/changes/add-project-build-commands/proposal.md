# Add project build commands

## Why

Running a project's build or test commands today means opening a shell terminal and typing the command by hand, every time. ainide already stores per-project settings in the global configuration and runs real PTY terminals per project, so common project commands can become first-class, one-click run configurations — an Android Studio-style dropdown plus play button in the top bar, usable from any mode.

## What Changes

- Per-project build command list in the global configuration: `projects.<rootPath>.buildCommands` as a list of `{ label, command }` entries. Backward compatible — a missing list means no build commands.
- New project-settings API mirroring the existing agent-settings endpoints: read a project's build commands and replace the project's list, identified by absolute root path, validated and persisted to the configuration file.
- New "Build commands" section in the existing per-project settings dialog: add, edit, and remove labeled commands.
- New top-bar build runner visible in all primary modes: a dropdown of the active project's build commands plus a play/stop button. With no commands defined, the dropdown is disabled and shows a hint that points to project settings.
- New `"build"` terminal session kind that executes the given command through the configured shell (`shell -lc <command>`) with the project root as working directory. The session title is the command's label.
- Run semantics: at most one live build per project. Pressing play with no live build starts the selected command and opens the terminal utility panel focused on the new session; while a build is running, the button acts as stop for that build, and starting a different command is blocked until it finishes or is stopped. The terminal's existing exit display (exit code) applies.
- Last selected build command is remembered per project in browser-local storage, defaulting to the first defined command.
- The terminal utility panel becomes available in all primary modes (Edit, Review, Agents, LazyGit) instead of being hidden outside Edit.

Non-goals (explicitly out of scope): variable interpolation in commands, parallel builds, per-command environment or argument lists, build output parsing or error detection, and any persistence of build state beyond the configuration file and browser-local UI preferences.

## Capabilities

### New Capabilities

- `project-build-commands`: per-project labeled build command definitions, their settings API and settings-dialog editor, the top-bar dropdown/play-stop runner, the "build" terminal session kind and its one-at-a-time run semantics, and the per-project remembered selection.

### Modified Capabilities

- `terminal-utility-panel`: the panel is currently hidden in Agents mode (and effectively only shown on Edit); it becomes available in all primary modes, including Agents and LazyGit, while retaining its existing collapse preference behavior.

## Impact

- `apps/server`: `config.ts` (per-project `buildCommands` type, load/save and validation), `server.ts` (new `GET`/`PATCH` project builds routes), `terminals.ts` (new `"build"` kind that honors the supplied command).
- `packages/shared`: `TerminalKind` gains `"build"`; new types for build command definitions and the builds-settings API requests/responses.
- `apps/web`: `App.tsx` top bar (dropdown + play/stop, present in all modes), `ProjectAgentSettingsDialog` (build commands section), `api.ts` (builds endpoints), `store.ts` (runner state), `layout-prefs.ts` (panel visible in all modes), `TerminalPanel` (focus the run's session), styles.
- `config.json`: new optional per-project field; existing files remain valid.

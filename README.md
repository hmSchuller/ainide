# ainide

> A local-first browser cockpit for editing code, running real terminals, supervising local agents, and reviewing Git changes.

ainide keeps the human editing surface and the AI interface close together without adding a hosted service. Monaco is the editing surface; ACP-backed conversations and the terminal are the AI interfaces; Git and Difit provide review. Agents remain local processes owned by the ainide server.

ainide is an early-stage `0.1.0` project intended for one local user. It runs commands with your normal user permissions and is not a remote IDE, sandbox, or collaboration service.

## Install

ainide installs entirely within your user account — no `sudo`, no service, no background daemon. It requires **Node.js 18+** and **Git**; the installer stops with guidance if either is missing and leaves nothing half-installed.

```sh
curl -fsSL https://raw.githubusercontent.com/hmSchuller/ainide/main/install.sh | bash
```

The installer:

- clones the repository into `~/.ainide/src`,
- installs dependencies from the committed lockfile and builds the app,
- downloads the pinned `lazygit` binary for your Mac into `~/.ainide/tools`, verifying its checksum,
- installs the `ainide` launcher into `~/.local/bin`, and
- prints the one `PATH` line you need to add to your shell.

Add the printed line to your shell profile (for example `~/.zshrc`) and start a new shell, then run:

```sh
ainide
```

`ainide` starts the server in the foreground of the terminal and prints the cockpit URL, for example `http://127.0.0.1:43127/?token=…`. Open that URL. The terminal owns the server: close the terminal or press `Ctrl+C` to stop it and its sessions.

### Updating

Refresh the install with:

```sh
ainide update
```

This fast-forwards `~/.ainide/src`, reinstalls dependencies from the lockfile, and rebuilds. It refuses to run over a working tree with local changes (commit or stash them first), does not restart a running server, and prints a reminder to restart `ainide` to apply the update.

### Update check

At startup the server checks, at most once every six hours, whether a newer public release exists. The result is cached in `~/.config/ainide/`, the request carries no identifying data, and any failure is silent. When a newer release is known, the terminal prints an update line and the UI shows a top-bar badge with the version and a link to the release notes. Set `AINIDE_NO_UPDATE_CHECK=1` to disable the check entirely.

### Bundled tools

The installer pins a `lazygit` binary for your architecture into `~/.ainide/tools`. When it starts PTY sessions and the review process, the server puts that directory at the front of `PATH` and launches the pinned `lazygit` by absolute path, so the bundled copy is used even if another `lazygit` is on your `PATH`. `difit` is an npm package with no standalone macOS binary, so it is not bundled and resolves from your `PATH` as before. Point `AINIDE_TOOLS_DIR` at a different tools directory, or set it to an empty string to stop bundling and rely on `PATH` alone.

## Features

- **Edit**: Browse a workspace, open files in Monaco, use two editor panes, drag tabs between panes, and search file paths.
- **Safe editing**: Text buffers auto-save after a short pause, manual save is available, and external changes are surfaced as conflicts instead of silently replacing dirty work.
- **Review**: Launch an optional local Difit review for the working tree, staged changes, the last commit, or the current branch versus `main`.
- **Agents**: Run multiple named PTY or ACP agent sessions, focus one session, or pin a second session for side-by-side observation. Provider-reported subagents appear within their ACP parent session when available.
- **LazyGit**: Open a dedicated full-height Lazygit surface for interactive Git work in the active project.
- **Edit utilities**: Use real shell and custom PTY sessions from Edit mode through xterm.js.
- **Reference kit**: Capture a selection or whole file, copy it as plain text with path and line provenance, or explicitly insert it into a selected live agent without submitting it.
- **Projects**: Keep several local projects open in one ainide process and switch between them without killing their PTY sessions.
- **Git status**: See changed files, branch information, and insertion/deletion counts in the explorer and top bar.
- **Local session resume**: Remember projects, open file paths, layout, mode, and terminal session descriptions in a local snapshot, then restore the last active project with new PTY processes.

## Optional local tools

| Tool | Used for | Required? |
| --- | --- | --- |
| `git` | Git status and repository metadata | No |
| `difit` | Review mode and embedded diffs | No |
| `lazygit` | LazyGit mode and interactive Git terminal | No |
| Your agent CLI | Agent PTY sessions | No |
| Cursor `agent` | Cursor ACP sessions with `agent acp` | No |
| OpenCode `opencode` | OpenCode ACP sessions with `opencode acp` | No |

`lazygit` is provided by the installer's bundled copy, and `difit` is expected on your `PATH` (for example via `npm install -g difit`). Neither is required to start ainide; modes that depend on a missing tool report that clearly.

## Using ainide

### Choose and switch projects

Start in the home-rooted workspace picker. Choose immediate child directories one level at a time, use Home or Parent to navigate, or enter a tilde-aware or absolute path manually. ainide remembers successfully opened projects in browser-profile-local storage as direct-open shortcuts; browsing and failed opens do not change that list. Opening another project starts a fresh picker session at `~`. Use the project switcher in the top bar to open another project, switch between open projects, or close a project. Only one project is visible at a time, but PTYs for other open projects continue running until the project is closed or the ainide process exits.

### Primary modes

Use the top-bar tabs or command palette to switch among **Edit**, **Review**, **Agents**, and **LazyGit**. ainide does not register direct numeric shortcuts for mode changes.

### Edit files

Open files from the workspace explorer or use `Cmd/Ctrl+P` to search file paths. Normal clicks open files in the primary pane; Shift-click opens a file in the secondary pane. Text changes auto-save after a short debounce. If a file changes on disk while its buffer is dirty, ainide shows the on-disk version and lets you reload, keep your buffer, or compare the two versions. Binary files are detected but are not editable as text.

### Run agents

Use **Agents** mode to supervise multiple local agent sessions. **+ New agent** / **Start an agent** opens the **ACP PROVIDERS** picker, which lists configured providers enabled for the active project. Select an ACP provider or the explicit PTY agent option to start a session. Recent provider sessions appear only when that provider supports listing and resuming them. **Project settings** can disable a configured ACP provider for the project.

ACP and PTY are separate transports:

- **ACP** starts the configured provider directly over stdio, for example `agent acp` or `opencode acp`. The provider negotiates capabilities, so ainide shows only the structured messages, tools, files, terminal activity, permissions, authentication, commands, and configuration options that it advertises.
- **PTY** is a real `node-pty` terminal started by the server in the active workspace with `agentCommand` (or `AGENT_COMMAND`). It is an opaque terminal stream; ainide reports process facts and does not infer success or failure from terminal text.

The server owns both kinds of session. Switching modes or projects, or disconnecting the browser, does not intentionally terminate live sessions. PTY input is sent as typed; ACP prompts, cancellation, permission choices, and elicitation responses are explicit user actions. An ACP session starts with the provider label, which the provider may update unless the user renames the session.

ACP providers may report subordinate activity. ainide displays each reported subagent under its parent conversation with its available name or role, activity, and state. Subagents are not separate ainide sessions, and ainide does not invent missing status or add controls for them.

Handoff remains user-managed: copy ordinary prompt text into another session and submit it there. The browser-local **Reference kit** can also copy selected or whole-file text with path and line provenance, insert it into a selected PTY, or attach it to an unsent ACP draft. It is never submitted or persisted without an explicit user action.

### Edit utilities

Shell and custom utility terminals are available only from **Edit** mode. Use the utility terminal footer or command palette to start them. Review mode stays focused on Difit, and Lazygit lives in its own primary mode.

### LazyGit

Open **LazyGit** mode to work with the active project's Lazygit session in a full-height surface. The bundled `lazygit` is used when present. ainide reuses an existing Lazygit PTY when you return to the mode and reports clear unavailable or exited states when the tool is missing or stops.

### Review Git changes

Open **Review** mode and choose one of these shipped scopes:

- **Working tree**, including untracked files
- **Staged** changes
- **Last commit** (`HEAD~1` compared with `HEAD`)
- **Branch vs main**

ainide starts Difit as a local child process and embeds its ready URL. A running review is reused when switching between Edit and Review; changing projects or closing the project stops the review process. Review mode does not render the Edit utility terminal footer.

Agent-reported files and diffs open in the existing Edit and Review surfaces, with a route back to the originating session. Review is for inspection; use the local **LazyGit** surface or another explicit Git workflow for any changes to repository state.

## Configuration

The optional configuration file is read once when the server starts. By default it is:

```text
~/.config/ainide/config.json
```

Set `AINIDE_CONFIG` to use another path. Example:

```json
{
  "agentCommand": "claude",
  "defaultShell": "/bin/zsh",
  "reviewTool": "difit",
  "acpAgents": [
    { "id": "cursor", "label": "Cursor", "command": "agent", "args": ["acp"] },
    { "id": "opencode", "label": "OpenCode", "command": "opencode", "args": ["acp"] }
  ],
  "projects": {
    "/Users/you/src/project": {
      "disabledAgents": ["cursor"],
      "buildCommands": [
        { "label": "Tests", "command": "npm test" }
      ]
    }
  }
}
```

`agentCommand`, `defaultShell`, `reviewTool`, `acpAgents`, and `projects` are the supported configuration keys. Each `acpAgents` entry requires `id`, `label`, `command`, and an `args` array; `env` is optional and is passed to that local provider. Project keys are workspace root paths. `disabledAgents` contains configured ACP provider ids, and `buildCommands` contains labelled local commands (at most 20; labels are at most 80 characters and commands at most 500 characters). ACP capabilities and provider-specific options come from provider negotiation.

| Variable | Description | Default |
| --- | --- | --- |
| `AINIDE_CONFIG` | Configuration file path | `~/.config/ainide/config.json` |
| `AINIDE_SESSIONS` | Session snapshot path | Next to the config file, usually `~/.config/ainide/sessions.json` |
| `AINIDE_TOOLS_DIR` | Directory of bundled tools prepended to child `PATH`; empty string disables bundling | `~/.ainide/tools` |
| `AINIDE_NO_UPDATE_CHECK` | Set to `1` to skip the startup release check | Unset (check enabled) |
| `AGENT_COMMAND` | Overrides `agentCommand` | The configured command, or the default shell |
| `DEFAULT_SHELL` | Overrides `defaultShell` | `$SHELL`, or `/bin/sh` |
| `HOST` | Backend bind address | `127.0.0.1` |
| `PORT` | Backend listen port and development proxy target | `43127` |

Keep `HOST` set to `127.0.0.1` unless you deliberately want to expose ainide beyond the local machine. ainide has no user accounts or remote authentication; the process-local session token is regenerated on every server start and is not persisted.

## Local-first boundaries

- Filesystem APIs accept workspace-relative paths only and reject path traversal and symlink escapes.
- Terminal and agent commands run locally with the permissions and environment of the user running the server.
- No cloud services, accounts, telemetry, or provider-specific AI APIs are required or included. The single exception is the bounded startup release check described above: at most once every six hours, no identifying data, cacheable, and disabled with `AINIDE_NO_UPDATE_CHECK=1`.
- Recent projects are isolated by browser profile and origin. If profiles share one ainide server, the active project, open-project registry, PTY ownership, and server session snapshots remain global to that server; browser profiles do not provide independent sessions.
- The picker does not read or write the legacy `ainide:last-workspace` browser value. Existing values are ignored, and each picker session starts at `~`.
- The local session snapshot stores project paths, open file paths, pane layout, mode, terminal kinds, agent titles, resumable ACP descriptors, and provider preferences. It does not store workspace contents, unsaved buffers, authentication secrets, session tokens, provider environment values, live protocol streams, terminal scrollback, process IDs, commands, or reference-kit contents.
- Unsaved buffers survive switching projects in the same browser page, but are not restored after a browser reload.
- PTYs survive browser disconnects and project switches while the server is running. The terminal owns the server: closing it, or `Ctrl+C`, terminates them. ainide uses no tmux or other external process holder.

## Persistence and lifecycle

Persistence is non-destructive: snapshots contain UI state and safe session descriptors, not conversation transcripts, prompt or reference contents, credentials, or running-process state. On restart, an ACP descriptor is resumed only when its provider supports it; otherwise the session is shown as non-resumable. A restored PTY is a new process. The terminal owns the server: `Ctrl+C`, terminal close, `SIGINT`, `SIGTERM`, and `SIGHUP` stop live PTY, ACP, and review processes as applicable and persist the safe snapshot. Browser disconnect and mode or project switching do not stop live sessions.

## Project structure

```text
apps/server    Fastify HTTP/WebSocket server, PTYs, filesystem APIs, watchers, Git, and review lifecycle
apps/web       React/Vite cockpit with Monaco, xterm.js, Zustand, explorer, and review surfaces
packages/shared Shared TypeScript protocol and domain types
```

## Developing ainide

These are for working on ainide itself; end users only need the [Install](#install) steps above.

### Requirements

- Node.js 18+ and npm
- A local shell
- An existing local directory to use as a workspace

Git, Difit, and Lazygit are optional. They add functionality but are not required to run the development server.

### Development

From the repository root:

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal and choose an existing workspace directory. The picker starts at the server user's home directory (`~`), shows only one level of child directories at a time, and also accepts `~`, `~/...`, or an absolute path such as `/Users/you/src/project`.

The development server runs the React/Vite frontend and Fastify backend together. The backend listens on `127.0.0.1:43127` by default, and Vite proxies API and WebSocket traffic to it. Set `PORT` to use another available backend port; the development proxy follows the same value.

### Build and serve locally

```sh
npm run build
npm run start -w @ainide/server
```

After building, the backend serves the compiled frontend when `apps/web/dist` is available. Open `http://127.0.0.1:43127` unless you configure another host or port.

### Repository commands

Run these from the repository root:

```sh
npm run dev         # Start the backend and Vite frontend
npm run build       # Build shared types, server, and frontend
npm run typecheck   # Type-check all workspaces
npm test            # Run server and frontend tests
```

## Troubleshooting

- **`ainide` is not found after installing**: Add the `PATH` line the installer printed to your shell profile and start a new shell, or run the launcher directly at `~/.local/bin/ainide`.
- **The installer stopped and nothing was installed**: It is missing a prerequisite. Follow the printed guidance (Git via `xcode-select --install` or `brew install git`; Node 18+ via `brew install node`), then re-run the installer.
- **The workspace will not open**: ainide requires an existing directory. Use `~`, `~/...`, or an absolute path; the server validates and canonicalizes the result.
- **Review is unavailable**: Confirm the workspace is a Git repository and that `difit` is installed and available on `PATH` (for example `npm install -g difit`). The branch-vs-main scope needs a local `main` branch.
- **Lazygit will not start**: The installer bundles `lazygit` into `~/.ainide/tools`. If it is missing there, re-run the installer or point `AINIDE_TOOLS_DIR` at a directory containing `lazygit`.
- **The update badge or startup line appears**: A newer release is available. Run `ainide update`, then restart. To stop the check, set `AINIDE_NO_UPDATE_CHECK=1`.
- **The agent terminal is empty or unavailable**: Confirm the configured agent command is installed and executable from the server's environment.
- **An ACP provider will not start**: Confirm its configured command and arguments are installed and executable from the server's environment. Authentication remains provider-local and ACP model options appear only after the provider initializes.
- **A project did not restore**: Session restoration is best effort. Missing directories or unavailable optional tools are reported while known projects remain available in the picker.
- **Search does not find code text**: File search matches names and paths; it does not search file contents.
- **PTY startup fails**: `node-pty` is a native dependency; reinstall dependencies with `npm install` and verify that a local shell is available.

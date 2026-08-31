# ainide

> A local-first browser cockpit for editing code, running real terminals, supervising local agents, and reviewing Git changes.

ainide keeps the human editing surface and the AI interface close together without adding a hosted service. Monaco is the editing surface; ACP-backed conversations and the terminal are the AI interfaces; Git and Difit provide review. Agents remain local processes owned by the ainide server.

ainide is an early-stage `0.1.0` project intended for one local user. It runs commands with your normal user permissions and is not a remote IDE, sandbox, or collaboration service.

## Features

- **Edit**: Browse a workspace, open files in Monaco, use two editor panes, drag tabs between panes, and search file paths.
- **Safe editing**: Text buffers auto-save after a short pause, manual save is available, and external changes are surfaced as conflicts instead of silently replacing dirty work.
- **Review**: Launch an optional local Difit review for the working tree, staged changes, the last commit, or the current branch versus `main`.
- **Agents**: Run multiple named PTY or ACP agent sessions, focus one session, or pin a second session for side-by-side observation.
- **LazyGit**: Open a dedicated full-height Lazygit surface for interactive Git work in the active project.
- **Edit utilities**: Use real shell and custom PTY sessions from Edit mode through xterm.js.
- **Reference kit**: Capture a selection or whole file, copy it as plain text with path and line provenance, or explicitly insert it into a selected live agent without submitting it.
- **Projects**: Keep several local projects open in one ainide process and switch between them without killing their PTY sessions.
- **Git status**: See changed files, branch information, and insertion/deletion counts in the explorer and top bar.
- **Review**: Launch an optional local Difit review for the working tree, staged changes, the last commit, or the current branch versus `main`.
- **Local session resume**: Remember projects, open file paths, layout, mode, and terminal session descriptions in a local snapshot, then restore the last active project with new PTY processes.

## Quick start

### Requirements

- Node.js and npm
- A local shell
- An existing local directory to use as a workspace

Git, Difit, Lazygit, and an agent CLI are optional. They add functionality but are not bundled with ainide.

### Development

From the repository root:

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal and enter the absolute path to an existing workspace directory, for example `/Users/you/src/project`.

The development server runs the React/Vite frontend and Fastify backend together. The backend listens on `127.0.0.1:43127` by default, and Vite proxies API and WebSocket traffic to it. Set `PORT` to use another available backend port; the development proxy follows the same value.

### Build and serve locally

```sh
npm run build
npm run start -w @ainide/server
```

After building, the backend serves the compiled frontend when `apps/web/dist` is available. Open `http://127.0.0.1:43127` unless you configure another host or port.

## Optional local tools

ainide detects these commands on the local `PATH`:

| Tool | Used for | Required? |
| --- | --- | --- |
| `git` | Git status and repository metadata | No |
| `difit` | Review mode and embedded diffs | No |
| `lazygit` | LazyGit mode and interactive Git terminal | No |
| Your agent CLI | Agent PTY sessions | No |
| Cursor `agent` | Cursor ACP sessions with `agent acp` | No |
| OpenCode `opencode` | OpenCode ACP sessions with `opencode acp` | No |

The configured PTY agent is not supplied by ainide. Any locally installed command can be used, including a command with arguments. ACP providers are configured as direct command and argument pairs; ainide does not install or proxy them through a shell. Review mode requires both a Git repository and the `difit` CLI. The `branch vs main` scope additionally requires a local `main` branch.

## Using ainide

### Choose and switch projects

Start by entering an absolute workspace path. Use the project switcher in the top bar to open another project, switch between open projects, or close a project. Only one project is visible at a time, but PTYs for other open projects continue running until the project is closed or the ainide process exits.

### Primary modes

Use the top-bar tabs or command palette to switch among **Edit**, **Review**, **Agents**, and **LazyGit**. ainide does not register direct numeric shortcuts for mode changes.

### Edit files

Open files from the workspace explorer or use `Cmd/Ctrl+P` to search file paths. Normal clicks open files in the primary pane; Shift-click opens a file in the secondary pane. Text changes auto-save after a short debounce. If a file changes on disk while its buffer is dirty, ainide shows the on-disk version and lets you reload, keep your buffer, or compare the two versions. Binary files are detected but are not editable as text.

### Run agents

Use **Agents** mode to create and name multiple agent sessions. PTY sessions are real terminals started in the active workspace using the configured agent command. ACP sessions use a configured local provider such as `agent acp` or `opencode acp` and expose structured conversation, tool activity, permissions, and provider-advertised configuration. Switching modes or projects does not intentionally terminate live sessions.

The editor and explorer can add files or selected lines to the reference kit. Choose a live agent as the target, then use **Paste reference kit** to insert the captured context into its terminal. Insertion is explicit, sends no trailing newline, and does not submit the agent prompt. **Copy kit** remains available as a clipboard fallback.

### Edit utilities

Shell and custom utility terminals are available only from **Edit** mode. Use the utility terminal footer or command palette to start them. Review mode stays focused on Difit, and Lazygit lives in its own primary mode.

### LazyGit

Open **LazyGit** mode to work with the active project's Lazygit session in a full-height surface. ainide reuses an existing Lazygit PTY when you return to the mode and reports clear unavailable or exited states when the optional tool is missing or stops.

### Review Git changes

Open **Review** mode and choose one of these scopes:

- Working tree, including untracked files
- Staged changes
- Last commit (`HEAD~1` compared with `HEAD`)
- Branch versus `main`

ainide starts Difit as a local child process and embeds its ready URL. A running review is reused when switching between Edit and Review; changing projects or closing the project stops the review process. Review mode does not render the Edit utility terminal footer.

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
  "acpAgents": [
    { "id": "cursor", "label": "Cursor", "command": "agent", "args": ["acp"] },
    { "id": "opencode", "label": "OpenCode", "command": "opencode", "args": ["acp"] }
  ]
}
```

| Variable | Description | Default |
| --- | --- | --- |
| `AINIDE_CONFIG` | Configuration file path | `~/.config/ainide/config.json` |
| `AINIDE_SESSIONS` | Session snapshot path | Next to the config file, usually `~/.config/ainide/sessions.json` |
| `AGENT_COMMAND` | Overrides `agentCommand` | The configured command, or the default shell |
| `DEFAULT_SHELL` | Overrides `defaultShell` | `$SHELL`, or `/bin/sh` |
| `HOST` | Backend bind address | `127.0.0.1` |
| `PORT` | Backend listen port and development proxy target | `43127` |

Keep `HOST` set to `127.0.0.1` unless you deliberately want to expose ainide beyond the local machine. ainide has no user accounts or remote authentication; the process-local session token is regenerated on every server start and is not persisted.

## Local-first boundaries

- Filesystem APIs accept workspace-relative paths only and reject path traversal and symlink escapes.
- Terminal and agent commands run locally with the permissions and environment of the user running the server.
- No cloud services, accounts, telemetry, or provider-specific AI APIs are required or included.
- The local session snapshot stores project paths, open file paths, layout, mode, and terminal descriptions. It does not store file contents, unsaved buffers, terminal scrollback, process IDs, commands, reference kits, or session tokens.
- Unsaved buffers survive switching projects in the same browser page, but are not restored after a browser reload.
- PTYs survive browser disconnects and project switches while the server remains running. They are terminated when ainide exits; ainide does not use tmux or another external process holder.

## Project structure

```text
apps/server    Fastify HTTP/WebSocket server, PTYs, filesystem APIs, watchers, Git, and review lifecycle
apps/web       React/Vite cockpit with Monaco, xterm.js, Zustand, explorer, and review surfaces
packages/shared Shared TypeScript protocol and domain types
```

## Development commands

Run these from the repository root:

```sh
npm run dev         # Start the backend and Vite frontend
npm run build       # Build shared types, server, and frontend
npm run typecheck   # Type-check all workspaces
npm test            # Run server and frontend tests
```

## Troubleshooting

- **The workspace will not open**: ainide requires an existing directory and the path must be absolute.
- **Review is unavailable**: Confirm the workspace is a Git repository and that `difit` is installed and available on `PATH`. The branch-vs-main scope needs a local `main` branch.
- **Lazygit will not start**: Install `lazygit`, then open LazyGit mode or retry from the unavailable state. Shell utilities remain available from Edit mode.
- **The agent terminal is empty or unavailable**: Confirm the configured agent command is installed and executable from the server's environment.
- **An ACP provider will not start**: Confirm its configured command and arguments are installed and executable from the server's environment. Authentication remains provider-local and ACP model options appear only after the provider initializes.
- **A project did not restore**: Session restoration is best effort. Missing directories or unavailable optional tools are reported while known projects remain available in the picker.
- **Search does not find code text**: File search currently matches names and paths; it does not search file contents.
- **PTY startup fails**: `node-pty` is a native dependency; reinstall dependencies with `npm install` and verify that a local shell is available.

# ainide

ainide is a local-first developer cockpit around a real terminal, a small file explorer, Monaco, Git status, and an optional Difit review surface. The AI agent is deliberately just another PTY process.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL shown in the terminal, then enter an absolute workspace path. The backend binds to `127.0.0.1:3000` by default. To build and serve the web app from the backend, run `npm run build` followed by `npm run start -w @ainide/server`.

## Local configuration

Create `~/.config/ainide/config.json` (or set `AINIDE_CONFIG`) if desired:

```json
{
  "agentCommand": "claude",
  "defaultShell": "/bin/zsh",
  "reviewTool": "difit"
}
```

`AGENT_COMMAND`, `DEFAULT_SHELL`, `PORT`, and `HOST` environment variables override the file. The default host remains `127.0.0.1`; only change it deliberately.

## Current boundaries

- The server generates a fresh session token on every start; it is never persisted.
- File writes are explicit Monaco saves and are restricted to the selected workspace, including symlink checks.
- Git review uses Difit when its CLI is installed. Lazygit and the configured agent are optional local commands.

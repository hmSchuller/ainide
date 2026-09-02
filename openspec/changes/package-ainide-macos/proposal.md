# Proposal: package-ainide-macos

## Why

ainide today can only be used by cloning the repository and running `npm install` / `npm run dev` / `npm run build` by hand. There is no install path, no launcher, no way to find out or apply a newer version, and the optional tools (difit, lazygit) are left entirely to the user's PATH. This change makes ainide a distributable product for other developers: one command to install, one command to start, one command to update — while staying strictly local-first (no cloud service, no accounts, no telemetry, no background daemon).

## What Changes

- **Installer script** (`install.sh` at the repository root): clones the public repository into `~/.ainide/src`, installs dependencies from the committed lockfile (`npm ci`), builds, downloads pinned `difit` and `lazygit` binaries into `~/.ainide/tools`, installs a launcher to `~/.local/bin/ainide`, and prints the single shell line the user must add to their PATH. No sudo; everything under the user home.
- **Two-verb `ainide` launcher**: `ainide` runs the built server in the foreground and prints the cockpit URL for click-to-open; `ainide update` runs `git pull --ff-only` + `npm ci` + build in the install directory and tells the user to restart to apply. No daemon, no pidfile, no background process — the terminal owns the server lifecycle.
- **Server lifecycle hardening**: the server entrypoint gains a `SIGHUP` handler alongside the existing `SIGINT`/`SIGTERM` handlers so closing the terminal performs the same graceful teardown (PTYs, ACP providers, review process, watchers), and a busy-port startup failure prints an actionable message instead of a stack trace.
- **Update prompt on startup**: the server checks the latest public GitHub release at most once per 6 hours (cached in `~/.config/ainide/`), fail-silent, disabled via `AINIDE_NO_UPDATE_CHECK=1`. When a newer release exists it is shown as a terminal line at startup and as a top-bar badge in the web UI linking to the release notes. The check is a single identifier-free GET to the GitHub API — the one deliberate, killable exception to the local-first boundary, recorded in AGENTS.md.
- **Opinionated bundled tools**: the server prepends `~/.ainide/tools` to the `PATH` of every child process it spawns (PTY sessions, review process), so the pinned difit/lazygit versions win over user-installed ones. An environment variable disables the prepend.
- **Licensing and release**: add an MIT `LICENSE` (`Copyright (c) 2026 Hans-Martin Schmargendorf`), set the `license` field, document install/update in the README, and cut the first `v*` release tag (which is what activates the update check).
- **README**: install, usage (`ainide`, `ainide update`), update-check policy, and bundled-tools sections replace the developer-only quick start as the primary path.

## Capabilities

### New Capabilities

- `distribution`: how ainide is installed, launched, updated, and how its pinned optional tools (difit, lazygit) are provided and take precedence.

### Modified Capabilities

- None. Review and LazyGit mode availability requirements still hold; the bundled tools only make the tools more reliably present. The update badge is new UI within `distribution`.

## Impact

- **New files**: `install.sh`, `bin/ainide` (launcher source), `tools/versions.json` (pinned tool versions + checksums), `LICENSE`, server-side update-check module, web top-bar update badge, shared types for the version API.
- **Modified code**: `apps/server/src/index.ts` (SIGHUP, busy-port message), `apps/server/src/server.ts` (version endpoint, tools-dir PATH prepend for spawned children), `apps/web` (badge + store wiring), `packages/shared` (version API types), `README.md`, `AGENTS.md` (local-first exception note).
- **Dependencies**: none new. The update check uses Node's built-in `fetch`. Tool binaries are fetched at install time and never committed.
- **Boundaries preserved**: 127.0.0.1 bind, session-token checks, workspace-relative filesystem APIs, no cloud services/accounts/telemetry. The single bounded release-metadata fetch is the only network behavior added and is cacheable and killable.

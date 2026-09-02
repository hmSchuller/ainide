# Design: package-ainide-macos

## Context

See proposal.md for motivation. Current state that shapes the approach:

- The product is one Node process (Fastify + WebSocket + `node-pty`) that serves the built web UI statically; the entrypoint `apps/server/src/index.ts` already wires `SIGINT`/`SIGTERM` to the graceful `close()` path, but not `SIGHUP`, and a busy-port `listen` failure currently surfaces as a raw error.
- `node-pty` ships prebuilds for darwin-arm64/x64 in the npm package, so `npm ci` on target Macs compiles nothing.
- The repository is public on GitHub (`hmSchuller/ainide`), has no tags or releases yet, no CI, and no license file.
- Configuration and session snapshots already live in `~/.config/ainide/` (XDG-style, deliberately kept on macOS).
- Constraints from AGENTS.md: local-first (no cloud services, accounts, telemetry, or provider-specific AI APIs), 127.0.0.1 binding with session-token checks, no new generic command-execution endpoints, shared types for protocol changes.

## Goals / Non-Goals

**Goals:**

- One-command install that works with only Node.js and Git present.
- A two-verb launcher whose entire mental model is "the terminal owns the process."
- A self-describing update path (prompt + `ainide update`) that never kills live sessions without a user keystroke.
- Deterministic tool versions (ainide version ⇒ difit + lazygit versions) without bundling a runtime or shipping artifacts.
- Zero new runtime dependencies.

**Non-Goals:**

- Daemons, background modes, pidfiles, `stop`/`status`/`open`/`restart` verbs, or launchd/login auto-start.
- Code signing, notarization, auto-update (download-and-replace), or any updater that acts without the user.
- Windows/Linux verification (the code stays portable, but only macOS is claimed), npm publishing, Homebrew, agent-CLI bundling (provider-owned boundary stays), and CI.

## Decisions

### 1. Foreground lifecycle, no daemon

`ainide` execs the built server in the foreground; the terminal is the lifecycle owner, exactly like `npm run dev`.

- Alternatives considered: (a) detached-spawn daemon with pidfile and `stop`/`status`/`open` verbs; (b) a per-user launchd LaunchAgent with KeepAlive/RunAtLogin.
- Why: the audience is developers who already leave terminal-launched processes running; a daemon adds a pidfile/stale-pid/log-rotation surface and hidden background state for a failure mode ("closed the terminal") that is simply how dev tools behave. Launchd's only real gains (auto-restart, login-start) save one retyped `ainide`, because session restore already makes cold start cheap. If ambient start is ever wanted, it is a later opt-in wrapper around the same entrypoint.
- Consequence accepted and documented in the README: closing the terminal terminates live agent sessions, same as closing any `npm run dev` terminal.

### 2. Launcher is a plain bash script

`bin/ainide` (installed to `~/.local/bin/ainide`) is a small bash script with two branches: `ainide update` runs the three update commands in the install directory; anything else `exec node "$AINIDE_HOME/src/apps/server/dist/index.js"`.

- Alternatives considered: (a) a Node script with a shebang; (b) an npm `bin` package.
- Why: without a daemon there is no process-spawning subtlety left (the earlier reason for a Node launcher was daemonizing, which is gone). `exec` keeps the server as the terminal's foreground process so signals (including SIGHUP) reach it directly. The port-busy pre-check deliberately moves into the server (decision 5) because a portable bash port probe on macOS is clumsier than catching `EADDRINUSE` in Node.
- `AINIDE_HOME` defaults to `~/.ainide` and is overridable for advanced users and tests.

### 3. Install layout

```
~/.ainide/src        git clone of the public repo (the install)
~/.ainide/tools/     pinned difit + lazygit binaries (installed by install.sh)
~/.local/bin/ainide  launcher (copied from the repo's bin/ainide)
~/.config/ainide/    existing config, sessions, plus the new update-check cache
```

- Alternatives considered: visible clone in a dev directory (update friction is lower, but it pollutes the user's workspace), `/usr/local` (needs sudo), versioned install directories (churn for a git-pull model).
- Why: hidden, stable, entirely user-writable; one PATH line (`export PATH="$HOME/.local/bin:$PATH"`); the git-pull update model needs one fixed directory.

### 4. Update is git-based, single-channel, user-timed

`ainide update` = `git pull --ff-only && npm ci && npm run build` inside `~/.ainide/src`. No self-replacing binaries, no channel detection, no checksums for the application itself — application integrity is git (signed by GitHub) plus the committed lockfile. The update prepares; applying requires the user to stop and restart `ainide`, so no flow ever kills live PTY/ACP sessions without a keystroke.

- Alternatives considered: (a) release-tarball self-update with checksum verification; (b) `npm i -g` from the registry.
- Why: (a) reintroduces the artifact/verification machinery this plan removed and adds a destructive auto-restart path; (b) adds a second install channel with its own update semantics. A single git channel keeps one source of truth and one command.
- `pull --ff-only` means a dirty or diverged tree is refused with a message; there is no auto-stash.

### 5. Server-side startup hardening

In `apps/server/src/index.ts`:

- Add `process.once("SIGHUP", shutdown)` next to the existing `SIGINT`/`SIGTERM` handlers, so terminal close, `kill`, and Ctrl+C all take the same graceful teardown.
- Catch `EADDRINUSE` from `app.listen`: print one line naming the port and suggesting "stop the other instance or set `PORT`", exit non-zero, no stack trace.

### 6. Update check: source, mechanics, surfacing

- **Current version**: `git describe --tags` in the install directory; fall back to the `package.json` version when no tag exists (true until the first release tag).
- **Latest version**: `GET https://api.github.com/repos/hmSchuller/ainide/releases/latest` — public repo, no auth, non-prerelease releases only. Alternatives considered: npm registry (no npm channel in this plan), a hand-maintained version file in the repo (extra upkeep, easy to forget).
- **Mechanics**: short-circuit before any I/O when `AINIDE_NO_UPDATE_CHECK=1`; use the cached result when `~/.config/ainide/update-check.json` is younger than 6 hours; otherwise one `fetch` with a ~2s timeout; any failure (network, HTTP, parse, "no release yet") is silent and leaves a stale/absent cache. The request sends no identifying data. This is a deliberate, documented exception to the local-first rule: it is release metadata, not telemetry, and it is cacheable and killable. AGENTS.md and the README both state this.
- **Surfacing**: at startup the server prints a terminal line when (and only when) a newer release is known. A new `GET /api/version` endpoint (types in `packages/shared`, token-checked like the rest of the API) returns `{ current, latest, notesUrl }` so the web UI renders a small top-bar badge: version, release-notes link, and the hint "`ainide update`, then restart". The badge disappears on the next restart after updating.

### 7. Tool pinning: manifest, checksums, PATH prepend

- `tools/versions.json` in the repo declares, per tool: `version`, download `url`, and `sha256`. The installer downloads each binary to `~/.ainide/tools/<name>`, verifies the checksum, and refuses to install on mismatch. No tool binaries are ever committed.
- The server prepends `~/.ainide/tools` to the `PATH` it hands to every child it spawns — PTY session env and the review-process env. Prepending (rather than resolving absolute paths at spawn) is a one-line env change per spawn site, keeps the existing command-name resolution and availability detection intact, and treats difit and lazygit identically.
- Escape hatch: `AINIDE_TOOLS_DIR` (default `~/.ainide/tools`); set to an empty string to skip the prepend and resolve purely from the user's PATH, exactly as today.
- Bundled-wins is the opinionated default: an ainide version always implies its tool versions. Agent CLIs stay external per the provider-owned boundary.
- Before writing the manifest, verify the pinned upstream releases actually publish darwin-arm64 (and x64) artifacts; the first pins are the newest stable releases at implementation time.

### 8. License and release

Add `LICENSE` (MIT, `Copyright (c) 2026 Hans-Martin Schmargendorf`) and a `license` field on the root package. The first git tag (`v0.1.0`) plus a GitHub release of the same name is the entire shipping act: it gives `git describe` a version, creates the `releases/latest` target the update check reads, and makes the repo's code legibly MIT.

## Risks / Trade-offs

- [Closing the terminal kills live agent sessions] → Accepted and documented in the README as the lifecycle model; a launchd opt-in is explicitly a later, separate change if users want ambient start.
- [The update check is an outbound network call, in tension with "no cloud, no telemetry"] → Killable via env, cached for 6 hours, identifier-free, fail-silent; recorded as a named exception in AGENTS.md so it cannot look like a later drift.
- [difit may not publish a darwin binary for the target arch] → Verify upstream release artifacts before writing `tools/versions.json`; if an artifact is missing for an arch, pin only the tools that exist and let the missing one fall back to user-installed with the existing actionable-unavailable state.
- [`npm ci` failing mid-update can leave the install directory with a half-installed `node_modules`] → The running server is unaffected (code is in memory); the failure message tells the user to re-run `ainide update`. Acceptable at 0.1.0.
- [A dirty or diverged install directory blocks updates] → Refused with guidance (commit or stash); no silent stash. Users who patch their install opt into this.
- [No CI: the install path is only as verified as the maintainer's machine] → Accepted (deliberate: the author dogfoods on macOS). Mitigation: run `install.sh` in a fresh macOS user account at each release and run the existing test + acceptance suites from a clean install.
- [Checksums must move in lockstep with version bumps] → Both live in one small manifest file in one commit; a mismatch is a loud installer failure, never a silent install.

## Migration Plan

No installed users exist (development-only today), so there is no migration. Rollout order:

1. Land the code (launcher, installer, server changes, web badge, docs).
2. Add `LICENSE` and the `license` field.
3. Cut tag `v0.1.0` and create the GitHub release.
4. Smoke-test in a fresh macOS user account: pipe the installer to a shell, apply the PATH line, run `ainide`, verify Review + LazyGit use the bundled tools, run `ainide update` on a new tag, verify the prompt appears.

Rollback is deleting `~/.ainide`, the launcher file, and the PATH line; the code change reverts like any commit.

## Open Questions

- Initial pinned difit/lazygit versions and their exact download URLs/checksums: choose the newest stable releases at implementation time after verifying darwin artifacts (see risk above).

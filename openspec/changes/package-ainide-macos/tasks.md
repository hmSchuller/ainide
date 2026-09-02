# Tasks: package-ainide-macos

## 1. License and release readiness

- [x] 1.1 Add MIT `LICENSE` with `Copyright (c) 2026 Hans-Martin Schmargendorf` and a `license` field on the root `package.json`; verify `npm run typecheck` still passes and the license file renders correctly at the repository root
- [x] 1.2 Verify the first release target works by confirming `git describe --tags` output on a tagged commit and that `GET https://api.github.com/repos/hmSchuller/ainide/releases/latest` returns the expected JSON for the tag (check before tagging; the endpoint 404s until the first release exists)

## 2. Server lifecycle hardening

- [x] 2.1 Add a `SIGHUP` handler alongside the existing `SIGINT`/`SIGTERM` handlers in `apps/server/src/index.ts`; verify with a test that sending `SIGHUP` to the server process triggers the same graceful close (PTYs/ACP/review stopped, snapshot persisted) as `SIGTERM`
- [x] 2.2 Catch `EADDRINUSE` from `app.listen` in `apps/server/src/index.ts` and exit non-zero with one actionable line naming the port and suggesting stopping the other instance or setting `PORT`; verify with a test that a second server on the same port prints the message instead of a stack trace

## 3. Update check (server)

- [x] 3.1 Add a version-resolution helper that returns `git describe --tags` from the server's source directory, falling back to the root `package.json` version when no tag exists; verify with a unit test covering the tagged and untagged cases
- [x] 3.2 Add the update-check module: reads/writes `~/.config/ainide/update-check.json` with a 6-hour TTL, short-circuits before any I/O when `AINIDE_NO_UPDATE_CHECK=1`, fetches `releases/latest` with a ~2s timeout, filters prereleases, and fails silent on any error; verify with unit tests covering cache hit, cache miss, env-disabled (assert no fetch call), network failure, HTTP error, no-release response, and prerelease filtering
- [x] 3.3 Add a token-checked `GET /api/version` endpoint returning `{ current, latest, notesUrl }` with types in `packages/shared`, and print the terminal update line at startup when a newer release is known; verify with a server test asserting the endpoint shape and token rejection, and that the startup line appears only when `latest` is newer than `current`
- [x] 3.4 Run `npm run typecheck` and the server test suite; verify all pass with the new endpoint and check module

## 4. Update badge (web)

- [x] 4.1 Add a top-bar update badge in `apps/web` that fetches `/api/version` on load and renders the available version, a release-notes link, and the "`ainide update`, then restart" hint only when `latest` is newer than `current`; verify with a web test covering the hidden (up to date / error) and visible states
- [x] 4.2 Run `npm run typecheck` and the web test suite; verify all pass

## 5. Bundled tools

- [x] 5.1 Verify the newest stable `difit` and `lazygit` releases publish darwin-arm64 (and darwin-x64) artifacts; if a tool lacks a darwin artifact, record it and pin only the tools that exist (design risk #3); verify by listing the upstream release assets for the chosen versions
- [x] 5.2 Create `tools/versions.json` declaring, per pinned tool, `version`, download `url`, and `sha256`; verify the file parses and the URLs respond with the declared checksum (recompute and compare)
- [x] 5.3 Make the server prepend the tools directory (default `~/.ainide/tools`, overridable via `AINIDE_TOOLS_DIR`, empty string disables) to the `PATH` of every spawned child (PTY session env and review process env); verify with tests that a spawned child sees the prepended `PATH`, that `AINIDE_TOOLS_DIR=""` restores the unmodified `PATH`, and that tool-availability detection reports bundled tools as available

## 6. Launcher

- [x] 6.1 Create `bin/ainide`: a bash script where `ainide update` runs `git pull --ff-only && npm ci && npm run build` in `~/.ainide/src` (default, `AINIDE_HOME` override), refuses with guidance on a dirty tree, and prints a restart-to-apply hint on success, while any other invocation `exec`s `node <install>/apps/server/dist/index.js`; verify by running it against a scratch `AINIDE_HOME` clone for both the clean and dirty tree paths and by confirming the foreground exec reaches the server's URL line

## 7. Installer

- [x] 7.1 Create `install.sh` at the repository root: check Node.js and Git (stop with actionable guidance when missing, no partial install), clone the repo to `~/.ainide/src`, run `npm ci` and the build, download and checksum-verify the pinned tools into `~/.ainide/tools` (refuse on checksum mismatch), install the launcher to `~/.local/bin/ainide`, and print the exact PATH line; verify in a fresh macOS user account (or scratch `AINIDE_HOME` + `PATH` override) that a full install completes without sudo and `ainide` then starts the server
- [x] 7.2 Verify the installer's missing-prerequisite path by running it with Node (or Git) removed from `PATH`; verify it stops with the install guidance and leaves no partial installation

## 8. Documentation

- [x] 8.1 Update `README.md`: make install (`curl … install.sh`), `ainide` / `ainide update` usage, the update-check policy (including `AINIDE_NO_UPDATE_CHECK=1`), and the bundled-tools behavior the primary path, keeping the developer quick start secondary; verify the README's commands match the implemented behavior exactly (run each one from a clean install)
- [x] 8.2 Add the local-first exception note to `AGENTS.md` (one bounded, cacheable, killable release-metadata fetch; no identifying data) and the lifecycle model note (the terminal owns the server; closing it stops sessions); verify the wording is consistent with the README

## 9. Release and end-to-end verification

- [ ] 9.1 Cut tag `v0.1.0` and create the matching GitHub release; verify `git describe --tags` reports `v0.1.0` from a fresh clone and `releases/latest` resolves to it
- [ ] 9.2 Full smoke test from a clean install in a fresh macOS user account: install, start `ainide`, open the printed URL, confirm Review and LazyGit use the bundled tools, run `ainide update` after cutting a second tag and confirm the startup prompt and UI badge appear, then restart and confirm they clear; verify every step against the `distribution` spec scenarios

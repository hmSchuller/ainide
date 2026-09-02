## Purpose

Defines how ainide is installed on a machine, launched from the terminal, kept up to date, and supplied with its pinned optional tools (difit and lazygit), keeping the product local-first and daemon-free.

## ADDED Requirements

### Requirement: One-command local install

The installer SHALL install ainide entirely within the user's home directory without elevated privileges by cloning the public repository into a stable install directory, installing dependencies from the committed lockfile, building the application, placing pinned `difit` and `lazygit` binaries into a local tools directory, and installing the `ainide` launcher into a user-writable launcher directory. The installer SHALL require Node.js and Git and, when either is missing, SHALL stop and print actionable guidance for installing the missing tool without leaving a partial installation. The installer SHALL finish by printing the exact shell line the user must add to make the launcher directory available on PATH.

#### Scenario: Fresh install on a prepared machine

- **WHEN** a user runs the installer on a macOS machine with Node.js and Git available
- **THEN** after applying the printed PATH line, `ainide` starts the built server and the pinned difit and lazygit binaries are present in the local tools directory

#### Scenario: Missing prerequisite

- **WHEN** the installer runs and Node.js or Git is not available
- **THEN** the installer stops and prints the command or link to install the missing tool, without leaving a partial installation behind

#### Scenario: No elevated privileges

- **WHEN** the installer runs as an unprivileged user
- **THEN** it completes without requesting elevated privileges and without writing outside the user's home directory

### Requirement: Foreground launch with a visible URL

`ainide` SHALL run the built application server in the foreground of the calling terminal and SHALL print the cockpit URL, including the session token, so the user can open it by clicking or pasting. The command SHALL block the terminal while the server runs. The launcher SHALL NOT start a background or detached process, SHALL NOT write a pidfile, and SHALL NOT open the browser automatically.

#### Scenario: User starts the cockpit

- **WHEN** the user runs `ainide`
- **THEN** the server starts, the cockpit URL is printed in the terminal, and the terminal remains occupied until the server shuts down

#### Scenario: No background state

- **WHEN** the user runs `ainide`
- **THEN** no daemon or detached process is created and no pidfile is written

### Requirement: Busy port produces an actionable error

When the configured port is already in use, the server SHALL fail startup with a message that names the port and explains the remedy (stop the other instance or choose another port via `PORT`), without printing a raw stack trace.

#### Scenario: Port conflict

- **WHEN** another process is listening on the configured port and the user starts the server
- **THEN** startup fails with a message that names the port and suggests stopping the other instance or setting `PORT`

### Requirement: Every exit path performs graceful teardown

The server SHALL treat `SIGINT`, `SIGTERM`, and `SIGHUP` identically, each performing the existing graceful shutdown: closing HTTP and WebSocket connections, stopping file watchers, terminating PTY sessions, closing ACP provider sessions and their processes, stopping review processes, and persisting the session snapshot.

#### Scenario: User presses Ctrl+C

- **WHEN** the user presses Ctrl+C while PTY or ACP sessions are live
- **THEN** all owned child processes are terminated, the session snapshot is persisted, and the process exits cleanly

#### Scenario: User closes the terminal

- **WHEN** the user closes the terminal window that runs the server while sessions are live
- **THEN** the server performs the same graceful teardown as Ctrl+C and leaves no orphaned child processes

### Requirement: Update command prepares the new version

`ainide update` SHALL update the installed source in the install directory by performing a fast-forward-only pull, reinstalling dependencies from the committed lockfile, and rebuilding the application. When the working tree has local modifications, the command SHALL refuse to pull and SHALL print guidance to commit or stash the changes. On success it SHALL instruct the user to restart ainide to apply the update. The command SHALL NOT restart or stop a running server, and SHALL NOT auto-stash or discard local changes.

#### Scenario: Clean tree updates

- **WHEN** the user runs `ainide update` and the install directory has no local modifications
- **THEN** the source updates to the latest commit, dependencies and the build are refreshed, and a restart-to-apply hint is printed

#### Scenario: Dirty tree is refused

- **WHEN** the user runs `ainide update` and the install directory has uncommitted local changes
- **THEN** the update is refused, the local changes are left untouched, and the printed message explains that the changes must be committed or stashed

### Requirement: Update prompt on startup

At startup the server SHALL determine the local version from the newest git tag in the install directory, falling back to the package version when no tag exists, and SHALL compare it against the latest non-prerelease public release of the repository. The network check SHALL run at most once per 6 hours, SHALL cache its result in the local configuration directory, and SHALL send no identifying data. When a newer release exists, the server SHALL print the available version as a terminal line at startup, and the web UI SHALL show a top-bar badge identifying the available version with a link to the release notes and a hint that `ainide update` followed by a restart applies it.

#### Scenario: Newer release is available

- **WHEN** the latest release is newer than the local version
- **THEN** the terminal prints an update line at startup and the UI shows a top-bar badge with the available version, a release-notes link, and the update-plus-restart hint

#### Scenario: Already up to date

- **WHEN** the local version matches the latest release
- **THEN** no update line is printed and no badge is shown

#### Scenario: Check fails or no release exists

- **WHEN** the release check fails due to a network problem or the repository has no release yet
- **THEN** startup proceeds normally with no prompt, no badge, and no error surfaced to the user

#### Scenario: Check is cached

- **WHEN** the server restarts within the 6-hour cache window of a previous successful check
- **THEN** no new network request is made for the version check

#### Scenario: Check is disabled

- **WHEN** `AINIDE_NO_UPDATE_CHECK` is set to `1`
- **THEN** no version-check network request is made and no prompt or badge is shown

### Requirement: Pinned bundled tools take precedence

The installer SHALL place pinned versions of `difit` and `lazygit` in the local tools directory, with the pinned versions and expected checksums declared in the repository, and SHALL verify each downloaded binary against its declared checksum before installation. The server SHALL prepend the tools directory to the `PATH` of every child process it spawns, including PTY sessions and the review process, so bundled tools take precedence over same-named user-installed tools. An environment variable SHALL disable the prepend, in which case tools resolve from the user's `PATH` exactly as before. Tool-availability detection SHALL treat bundled tools as available.

#### Scenario: User has no local tools

- **WHEN** `difit` or `lazygit` is not present on the user's `PATH`
- **THEN** Review mode and LazyGit mode work using the bundled binaries

#### Scenario: User has a different version

- **WHEN** the user's `PATH` contains a different version of `lazygit`
- **THEN** the server starts the bundled version

#### Scenario: Bundled tools disabled

- **WHEN** the environment variable disabling the bundled tools directory is set
- **THEN** the server resolves `difit` and `lazygit` from the user's `PATH` as before

#### Scenario: Corrupted download is rejected

- **WHEN** a downloaded tool binary does not match its declared checksum
- **THEN** the installer does not install that binary and reports the mismatch

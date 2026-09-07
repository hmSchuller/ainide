# review-mode Specification

## Purpose

Review mode embeds a Difit diff viewer so users can inspect Git changes from the ainide cockpit without leaving the local-first workflow.

## Requirements

### Requirement: Review starts reliably for each supported scope

The system SHALL start a Difit review server for the selected scope without interactive prompts when launched from ainide. Supported scopes are working tree, staged, last commit, and branch vs main.

#### Scenario: Working tree with untracked files

- **WHEN** the user opens Review mode with scope "working tree" and the workspace contains untracked files
- **THEN** the system starts Difit non-interactively and returns a loadable review URL

#### Scenario: Staged changes

- **WHEN** the user opens Review mode with scope "staged"
- **THEN** the system starts Difit with the staged diff and returns a loadable review URL

#### Scenario: Last commit

- **WHEN** the user opens Review mode with scope "last commit"
- **THEN** the system starts Difit comparing the previous commit to HEAD and returns a loadable review URL

#### Scenario: Branch vs main

- **WHEN** the user opens Review mode with scope "branch vs main" and the repository has a `main` branch
- **THEN** the system starts Difit comparing `main` to HEAD and returns a loadable review URL

### Requirement: Review URL is returned only when Difit is ready

The system SHALL not return a review URL to the client until the Difit HTTP server is accepting connections on the chosen port.

#### Scenario: Successful startup

- **WHEN** Difit finishes starting and is listening on the assigned port
- **THEN** the review start response includes a URL that responds successfully to an HTTP request

#### Scenario: Startup timeout

- **WHEN** Difit does not become ready within a bounded startup window
- **THEN** the review start response reports failure with a clear message and does not include a URL

### Requirement: Review failures are reported clearly

The system SHALL surface actionable errors when review cannot start or Difit exits unexpectedly.

#### Scenario: Difit not installed

- **WHEN** Difit is not available on PATH
- **THEN** the review start response reports that Difit is missing and does not include a URL

#### Scenario: No workspace open

- **WHEN** the user requests review without an open workspace
- **THEN** the review start response reports that a workspace must be opened first

#### Scenario: Difit exits with error

- **WHEN** Difit exits before or after becoming ready with a non-zero exit code
- **THEN** the review status reflects that the review is not running and includes an exit message

#### Scenario: Invalid scope target

- **WHEN** the selected scope cannot be resolved in the repository (for example, branch vs main when `main` does not exist)
- **THEN** the review start response reports failure with a clear message and does not include a URL

### Requirement: Review iframe loads the returned URL

The Review surface SHALL embed the review URL returned by the server when present.

#### Scenario: Review URL available

- **WHEN** review start succeeds with a URL
- **THEN** Review mode displays an iframe pointed at that URL

#### Scenario: Review URL unavailable

- **WHEN** review start does not return a URL
- **THEN** Review mode displays the error message instead of an empty or broken iframe

### Requirement: Review status reports the active scope

The system SHALL include the active review scope in review status responses when a Difit session is running or was most recently started for a known scope.

#### Scenario: Running review includes scope

- **WHEN** a Difit review is running for scope "staged"
- **THEN** `GET /api/review/status` includes `scope: "staged"` and a loadable `url`

#### Scenario: Stopped review omits scope

- **WHEN** no Difit review is running
- **THEN** review status reports `running: false` and does not claim an active scope

### Requirement: Review reuses a running Difit session across Edit and Review mode

The system SHALL keep the Difit process running when the user switches from Review mode to Edit mode. Re-entering Review mode SHALL reuse the existing session when it is still running for the selected scope and returns a loadable URL, without forcing a new startup.

#### Scenario: Switch to Edit does not stop Difit

- **WHEN** the user is in Review mode with a running Difit session and switches to Edit mode
- **THEN** the Difit process remains running and review status still reports `running: true` with a URL

#### Scenario: Return to Review reuses running session

- **WHEN** the user switches back to Review mode, the selected scope matches the running session, and review status reports a loadable URL
- **THEN** Review mode displays the existing review URL without restarting Difit

#### Scenario: Scope change requires a new session

- **WHEN** the user changes the review scope and enters Review mode (or explicitly restarts review)
- **THEN** the system starts a new Difit session for the new scope

#### Scenario: Explicit restart replaces the session

- **WHEN** the user triggers "Restart review"
- **THEN** the system stops the current Difit session (if any) and starts a fresh one for the selected scope

### Requirement: Review entry is status-first

The client SHALL query review status before starting Difit when entering Review mode, and SHALL only call review start when no reusable running session exists for the selected scope or when an explicit restart was requested.

#### Scenario: Status check avoids redundant start

- **WHEN** the user enters Review mode and review status already reports a running session with a matching scope and URL
- **THEN** the client does not call `POST /api/review/start` and immediately shows the review surface

#### Scenario: Status check falls back to start

- **WHEN** the user enters Review mode and review status reports no running session or the scope does not match
- **THEN** the client calls `POST /api/review/start` for the selected scope

#### Scenario: Difit died while in Edit mode

- **WHEN** the user returns to Review mode but the Difit process exited while in Edit mode
- **THEN** review status reports `running: false`, the client starts a new session, and Review mode shows loading until a URL is available or an error is reported

### Requirement: Project switch still stops review

Switching the active project or closing a project SHALL stop the Difit review for the previous project. This behavior is unchanged from multi-project sessions.

#### Scenario: Switch project stops Difit

- **WHEN** the user switches to a different open project while a Difit session is running
- **THEN** the previous project's Difit process is stopped before the new project becomes active

### Requirement: Review mode is dedicated to the Difit surface

Review mode SHALL present the Difit review surface without rendering the shell or custom utility terminal footer. Utility terminal sessions remain available from Edit mode, while switching away from Review SHALL preserve the existing review lifecycle rules.

#### Scenario: User opens Review mode

- **WHEN** the user selects Review from the primary mode controls
- **THEN** the Review surface displays its Difit controls or status and no utility terminal footer

#### Scenario: User leaves Review mode

- **WHEN** the user switches from Review to Edit, Agents, or LazyGit
- **THEN** the Review surface follows its existing session reuse behavior and the user can return without Review gaining a utility terminal footer

### Requirement: Review uses the full workbench width

When Review mode is active, the system SHALL hide ainide's workspace explorer and its resize splitter so the Review surface occupies the available workbench width. The Review mode SHALL continue to preserve the explorer's project-local browsing state for when the user returns to a mode that displays it.

#### Scenario: User enters Review mode on desktop

- **WHEN** the user switches from Edit, Agents, or LazyGit to Review mode
- **THEN** ainide's workspace explorer and explorer splitter are not visible or interactive, and the Review surface expands into their former space

#### Scenario: User enters Review mode with the mobile explorer open

- **WHEN** the user switches to Review mode while the mobile explorer drawer is open
- **THEN** the drawer closes and does not overlay or obscure the Review surface

#### Scenario: User returns from Review mode

- **WHEN** the user switches from Review mode to Edit, Agents, or another mode that displays the workspace explorer
- **THEN** the explorer is visible again with its prior width, expanded directories, cached listings, and selected path preserved

#### Scenario: Review mode does not alter explorer data

- **WHEN** the user spends time in Review mode and then returns to the explorer
- **THEN** entering Review has not renamed, deleted, reloaded, or otherwise changed workspace files or explorer directory state

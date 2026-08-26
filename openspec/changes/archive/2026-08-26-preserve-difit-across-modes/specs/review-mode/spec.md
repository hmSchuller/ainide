## ADDED Requirements

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

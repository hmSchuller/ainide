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

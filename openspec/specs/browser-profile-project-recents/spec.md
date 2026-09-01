# browser-profile-project-recents Specification

## Purpose

This capability keeps recent project choices organized within each browser profile,
without introducing accounts, server-side browser identity, or a second project session
model.

## Requirements

### Requirement: Recent projects are isolated by browser profile

The application SHALL maintain a recent-project list in browser-profile-local storage.
Each project SHALL appear at most once in the list, ordered from most recently
successfully opened or switched to least recently used.

#### Scenario: Different browser profiles have separate recent lists

- **WHEN** a project is successfully opened in one browser profile
- **THEN** it is available as a recent project in that profile and is not added to the
  recent-project list of another browser profile

#### Scenario: Reusing a project moves it to the front

- **WHEN** a project already present in the current profile's recent list is successfully
  opened or switched to
- **THEN** the existing entry is moved to the most-recent position rather than duplicated

#### Scenario: Failed project access does not create a recent entry

- **WHEN** opening or switching to a project fails
- **THEN** the current profile's recent-project list remains unchanged

### Requirement: The workspace picker uses profile-local recents

The workspace picker SHALL present the current browser profile's recent projects, showing
enough project name and path information to distinguish entries. Selecting a recent
project SHALL use the same validated project-open behavior as entering its absolute path.

#### Scenario: Profile recents are shown in the picker

- **WHEN** the workspace picker opens and the current profile has recent projects
- **THEN** only that profile's recent projects are presented as recent choices, in most
  recently used order

#### Scenario: A recent project is selected

- **WHEN** the user selects a project from the recent-project list
- **THEN** the application attempts to open that project's stored path and records it as
  most recent only after the server confirms success

#### Scenario: A project is opened manually

- **WHEN** the user enters a valid absolute workspace path that is not in the current
  profile's recent list and the server opens it successfully
- **THEN** the project is added to the front of that profile's recent list

#### Scenario: Manual path entry remains available

- **WHEN** the current profile has no recent projects or the desired project is not listed
- **THEN** the picker still provides an absolute-path input and open action

### Requirement: Existing last-workspace fallback remains available

When the current profile has no recent-project list, the application SHALL retain the
existing last-workspace value as an initial path hint without treating the value as a
recent entry for another browser profile.

#### Scenario: Profile has no recent list

- **WHEN** the picker loads with no profile-local recent projects and a prior
  last-workspace value exists
- **THEN** the prior path is available as the initial path hint for opening a workspace

#### Scenario: Profile-local recents take precedence

- **WHEN** the current profile has one or more recent projects
- **THEN** the picker uses those recents for its project choices instead of importing the
  server's global known-project list into the profile

### Requirement: Recents do not change server project isolation semantics

The application SHALL treat browser-profile recent projects as an organization aid only.
It SHALL NOT claim that browser profiles provide independent active projects, open-project
registries, PTY ownership, or server-side session snapshots.

#### Scenario: Two profiles use one ainide server

- **WHEN** users in different browser profiles open or switch projects through the same
  ainide server
- **THEN** each profile retains its own recent list while the server continues to apply
  its existing global active-project behavior

#### Scenario: Browser profile storage is unavailable or malformed

- **WHEN** the recent-project storage cannot be read or contains invalid data
- **THEN** the application treats the profile as having no recent projects, keeps manual
  path entry available, and does not prevent workspace access

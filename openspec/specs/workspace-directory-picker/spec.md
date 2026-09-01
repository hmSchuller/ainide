# workspace-directory-picker Specification

## Purpose

This capability lets browser users discover and select local workspace directories without
having to know or type a complete absolute path in advance.

## Requirements

### Requirement: Manual path entry is presented before directory browsing

The workspace picker SHALL present the free-text directory path entry before the
click-based current-directory navigation controls and child-directory list. The explicit
`Open project` action SHALL be placed directly below the manual-entry block, while optional
path suggestions remain associated with that block and appear before the action when visible.

#### Scenario: Manual entry is the primary picker surface

- **WHEN** the workspace picker is displayed
- **THEN** the directory path field appears before the current-directory display, navigation
  controls, and child-directory list

#### Scenario: Open action follows manual entry

- **WHEN** the workspace picker displays the manual path field
- **THEN** the `Open project` action appears directly below the field and any visible path
  suggestions, before the click-based directory browser

#### Scenario: Suggestions remain attached to manual entry

- **WHEN** the user types a path segment that has matching immediate child directories
- **THEN** the suggestions appear within the manual-entry block and do not displace the
  click-based browser above the path field or obscure the `Open project` action

#### Scenario: Manual and click-based controls remain usable on narrow screens

- **WHEN** the workspace picker is displayed in a narrow viewport
- **THEN** the manual-entry block remains above the directory browser, the open action remains
  reachable beneath it, and the browser navigation controls remain usable below

### Requirement: Picker paths support home-directory shorthand

The workspace picker SHALL accept `~` and paths beginning with `~/` (or the platform
equivalent separator) in addition to absolute filesystem paths. The server SHALL expand
the leading shorthand to the server process user's home directory before validating,
opening, or returning a selected path. Other tilde forms, such as `~other-user`, SHALL
not be interpreted as shorthand.

#### Scenario: Home shorthand opens the home directory

- **WHEN** the user enters `~` and submits the picker
- **THEN** the server validates and opens the process user's home directory as the selected
  canonical workspace path

#### Scenario: Nested home shorthand opens the requested directory

- **WHEN** the user enters `~/projects/example` and that directory exists
- **THEN** the server expands the shorthand, validates the directory, and returns its
  canonical absolute path

#### Scenario: Unsupported tilde form is not expanded

- **WHEN** the user enters a path beginning with `~other-user`
- **THEN** the picker reports an invalid path and does not reinterpret it as another user's
  home directory

### Requirement: Every picker session starts at home

Whenever the workspace picker is opened, the current browse location SHALL reset to the
server process user's home directory and SHALL be displayed as `~`. This behavior SHALL
be the same on first launch and when opening another project. The picker SHALL NOT use the
browser `ainide:last-workspace` value or a previously browsed location as its initial path.

#### Scenario: First launch starts at home

- **WHEN** the picker is shown with no active workspace
- **THEN** its current path is `~` and its directory list contains only immediate children
  of the home directory

#### Scenario: Opening another project resets the location

- **WHEN** the user opens the picker after browsing to another directory
- **THEN** the new picker session starts at `~` rather than the previous browse location or
  the active project's parent

#### Scenario: Empty recent list does not change the starting location

- **WHEN** the current browser profile has no recent projects
- **THEN** the picker still starts at `~` and retains manual path entry

### Requirement: Directory discovery is immediate-child-only

The picker SHALL discover directory children for any existing path accessible to the
server process user, without restricting navigation to a configured root. A directory
listing SHALL contain only the immediate child directories of the requested current path.
It SHALL NOT recursively enumerate descendants, search unrelated filesystem locations, or
return file contents. Files MAY be omitted from directory-selection results.

#### Scenario: Current directory lists direct child folders

- **WHEN** the picker loads an existing readable directory
- **THEN** it shows that directory's immediate child folders and no deeper descendants

#### Scenario: Nested children load only after navigation

- **WHEN** the user navigates into one listed child directory
- **THEN** the picker requests and displays only the immediate children of the newly current
  directory

#### Scenario: An accessible path outside home is browsable

- **WHEN** the user enters an existing readable directory outside the home directory
- **THEN** the picker can list its immediate child folders subject to normal operating
  system permissions

#### Scenario: Directory browsing does not expose file data

- **WHEN** the picker requests children for a directory
- **THEN** the response contains directory navigation metadata only and no file contents,
  command output, or recursive filesystem snapshot

### Requirement: Path suggestions are scoped to the current level

The picker SHALL provide suggestions by matching the final typed path segment against
immediate child directories of the relevant parent path. Suggestions SHALL never search
deeper than that parent directory or across unrelated locations. Selecting a directory
suggestion SHALL navigate to that directory without opening it automatically.

#### Scenario: Partial child name produces local suggestions

- **WHEN** the user types `~/projects/a`
- **THEN** the picker suggests matching immediate child directories of `~/projects` and
  does not search descendants of those matches

#### Scenario: Selecting a suggestion navigates one level

- **WHEN** the user selects the `example` suggestion under `~/projects`
- **THEN** the current path becomes `~/projects/example` and the picker loads only that
  directory's immediate children

#### Scenario: No matching child is non-fatal

- **WHEN** the final path segment matches no immediate child directory
- **THEN** the picker shows no directory suggestions, preserves the typed path, and keeps
  manual submission available

### Requirement: Picker navigation has deterministic controls

The picker SHALL provide explicit Home and Parent navigation controls. It SHALL support
keyboard navigation for directory suggestions, including selecting a suggestion with arrow
keys, completing the active suggestion with Tab, and navigating or submitting with Enter
according to whether a suggestion is active. The current directory SHALL remain visibly
distinguishable from its child suggestions.

#### Scenario: Home control returns to the initial location

- **WHEN** the user activates Home from any browsed directory
- **THEN** the current path becomes `~` and only home-directory children are loaded

#### Scenario: Parent control moves up one level

- **WHEN** the user activates Parent from `~/projects/example`
- **THEN** the current path becomes `~/projects` and only its immediate children are loaded

#### Scenario: Keyboard completion does not open a project

- **WHEN** the user highlights a directory suggestion and presses Tab
- **THEN** the picker completes that directory in the path field without opening the
  workspace or changing recent-project storage

### Requirement: Opening the current directory remains explicit

The picker SHALL provide an explicit action to open the current directory. A successful
open SHALL use the same validated project-open behavior as manual path entry, and the
returned canonical project identity SHALL be used for profile-local recent-project
recording. A failed open SHALL preserve the current browse state and SHALL NOT add or
reorder a recent project.

#### Scenario: Current directory opens after navigation

- **WHEN** the user navigates to an existing directory and activates Open project
- **THEN** the application opens that canonical directory through the existing project
  operation

#### Scenario: Failed current-directory open preserves picker state

- **WHEN** opening the current directory fails
- **THEN** the picker displays the error, keeps the current path and child list, and leaves
  recent-project storage unchanged

#### Scenario: Recent project shortcuts bypass browsing

- **WHEN** the user selects a profile-local recent project
- **THEN** the application attempts to open its stored canonical path directly without
  changing the picker's home-rooted navigation contract

### Requirement: Directory browsing is authenticated and resilient

Directory-children requests SHALL require the existing ainide session token. The picker
SHALL treat missing directories, non-directories, permission failures, malformed responses,
and unavailable storage as recoverable errors that do not prevent manual path entry or
workspace access through a valid path.

#### Scenario: Unauthenticated directory request is rejected

- **WHEN** a directory-children request lacks the valid session token
- **THEN** the server rejects the request without listing filesystem entries

#### Scenario: Inaccessible current directory reports an error

- **WHEN** the server cannot read the requested directory because it is missing or
  inaccessible
- **THEN** the picker shows a useful error, retains the typed path, and keeps direct path
  submission available

#### Scenario: Stale navigation response is ignored

- **WHEN** a slower directory response arrives after the user has navigated to a different
  path
- **THEN** the picker does not replace the newer path's children with the stale response

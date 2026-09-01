## Purpose

The editor Git diff capability lets users see and inspect changes in an open file without leaving
the Edit surface or losing the context of the current editor buffer.

## ADDED Requirements

### Requirement: Open text files expose a Git comparison

The Edit surface SHALL compare each open text file in a Git repository with the committed `HEAD`
version of that file and the currently visible editor buffer. The comparison SHALL use the visible
buffer even when it contains edits that have not yet been auto-saved.

#### Scenario: Tracked file differs from HEAD

- **WHEN** a tracked text file is open and its visible buffer differs from the file at `HEAD`
- **THEN** the Edit surface exposes the file's line-level changes and an explicit detailed diff action

#### Scenario: Tracked file matches HEAD

- **WHEN** a tracked text file is open and its visible buffer matches the file at `HEAD`
- **THEN** the Edit surface shows no Git change markers and the detailed diff reports that the file is clean

#### Scenario: Untracked file is open

- **WHEN** an untracked text file is open in a repository with a valid `HEAD`
- **THEN** the system treats an empty file as the baseline and marks the file's visible content as added

#### Scenario: Visible buffer has unsaved edits

- **WHEN** an open text file's visible buffer differs from both its saved disk content and its `HEAD` version
- **THEN** the comparison reflects the visible buffer and identifies that the displayed changes include unsaved edits

### Requirement: The editor displays line-level change markers

The Edit surface SHALL display distinguishable line-level indicators for additions, modifications,
and deletions in every editor pane containing a comparable open text file. Markers SHALL be derived
from the current visible buffer and SHALL be removed when that buffer matches the comparison baseline.

#### Scenario: Lines are added

- **WHEN** the visible buffer contains lines that are absent from the baseline
- **THEN** the editor displays an addition marker at the corresponding current-buffer lines

#### Scenario: Lines are modified

- **WHEN** the visible buffer replaces baseline lines with different content
- **THEN** the editor displays a modification marker covering the affected current-buffer lines

#### Scenario: Lines are deleted

- **WHEN** baseline lines are absent from the visible buffer
- **THEN** the editor displays a deletion indicator anchored to the nearest applicable current-buffer line, including the end of the file when the deletion is at EOF

#### Scenario: Buffer changes after markers are displayed

- **WHEN** the user edits the visible buffer
- **THEN** the line-level markers are recalculated for the new buffer without changing the tab's content, save, or conflict semantics

### Requirement: Users can inspect a per-file detailed diff

The Edit surface SHALL provide an explicit action for the active comparable text file that opens a
read-only side-by-side comparison labeled with the `HEAD` baseline and the currently visible buffer.
Opening or closing the detailed diff SHALL not create a tab, save a buffer, reload a file, or alter
pane ownership.

#### Scenario: User opens a detailed diff

- **WHEN** the user invokes the per-file Git diff action for an open comparable text file
- **THEN** the active pane displays the `HEAD` content beside the currently visible buffer

#### Scenario: Detailed diff includes unsaved content

- **WHEN** the visible buffer has unsaved edits and the user opens its detailed diff
- **THEN** the current side shows those unsaved edits and the view identifies the current side as unsaved

#### Scenario: User closes a detailed diff

- **WHEN** the user returns from the detailed diff to the editor
- **THEN** the same tab, buffer content, dirty state, conflict state, and editor pane remain intact

#### Scenario: User requests a clean file's diff

- **WHEN** the active file matches its baseline and the user invokes the detailed diff action
- **THEN** the surface reports that there are no file changes instead of showing a misleading difference

### Requirement: Exceptional file states remain truthful

The system SHALL not present an ordinary two-way text diff when the file state makes that comparison
misleading. It SHALL preserve the existing Git status and editor conflict treatment for those states.

#### Scenario: Tracked file was deleted

- **WHEN** a tracked file is deleted from the working tree while its editor tab remains open
- **THEN** the file remains identified as deleted, normal current-buffer markers are not shown, and a detailed view may show the `HEAD` content against an empty current side

#### Scenario: File was renamed

- **WHEN** a tracked file is renamed and the renamed file is open
- **THEN** the detailed comparison uses the original `HEAD` path as its baseline and identifies both the old and new paths

#### Scenario: File is conflicted

- **WHEN** Git reports an open file as conflicted
- **THEN** the editor preserves its conflict state and does not assign ordinary addition, modification, or deletion markers to an unresolved two-way comparison

#### Scenario: File is binary

- **WHEN** an open file is binary or cannot be represented as text
- **THEN** the editor does not display line-level Git markers or offer a text diff for that file

#### Scenario: Workspace is not a repository or has no HEAD

- **WHEN** an open file belongs to a non-Git workspace or a repository without a committed `HEAD`
- **THEN** the editor displays no Git line markers and explains that a committed text baseline is unavailable

### Requirement: File comparison data is workspace-safe

The system SHALL expose file comparison data only through the authenticated active-workspace
boundary. It SHALL accept only workspace-relative paths, reject traversal, absolute paths, symlink
escapes, and requests that do not belong to the active project before reading or executing the
comparison operation.

#### Scenario: Authenticated request targets an active-workspace file

- **WHEN** an authenticated client requests comparison data for a relative path in the active workspace
- **THEN** the system returns only the baseline metadata and content for that workspace file

#### Scenario: Request is unauthenticated

- **WHEN** a client requests file comparison data without the valid session token
- **THEN** the system rejects the request and performs no Git or filesystem comparison operation

#### Scenario: Request escapes the workspace

- **WHEN** a client requests an absolute, traversal, or symlink-escaping path
- **THEN** the system rejects the request before reading the path or executing a Git comparison

### Requirement: Comparisons reconcile with live workspace state

The system SHALL refresh file comparison state when the active workspace's Git baseline or status
changes, and SHALL ignore results from an obsolete project, workspace, path, or session request.
Existing external-change conflict handling SHALL continue to take precedence over silently replacing
a dirty visible buffer.

#### Scenario: Git status changes for an open file

- **WHEN** active Git polling detects a changed file or a changed `HEAD` baseline
- **THEN** the open file's markers and detailed comparison use the latest available baseline and status

#### Scenario: Clean open file changes on disk

- **WHEN** Git polling detects an external change for an open file with no unsaved edits
- **THEN** the existing disk reload behavior runs and the Git markers are recalculated from the reloaded buffer

#### Scenario: Dirty open file changes on disk

- **WHEN** Git polling detects an external change for an open file with unsaved edits
- **THEN** the system retains the visible buffer, records the existing conflict state, and keeps the comparison explicitly based on that visible buffer

#### Scenario: Comparison completes after a project switch

- **WHEN** a file comparison request started for one project completes after the user switches projects
- **THEN** the response does not update the newly active project's tabs, markers, or comparison state

## ADDED Requirements

### Requirement: Review is bound to the active project

The system SHALL start and display review only for the active project. Switching the active project SHALL stop the previous project's review process. Review SHALL NOT start when no project is active.

#### Scenario: Review uses the active project root

- **WHEN** the user starts review while a project is active
- **THEN** Difit is launched with that project's directory as its working tree

#### Scenario: Switching projects stops review

- **WHEN** review is running for the active project and the user switches to a different open project
- **THEN** the previous review process is stopped and the review surface does not keep showing that previous project's URL

#### Scenario: No project open

- **WHEN** the user requests review without an active project
- **THEN** the review start response reports that a workspace must be opened first

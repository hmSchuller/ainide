## MODIFIED Requirements

### Requirement: Explorer refresh includes expanded directories

When the user triggers explorer refresh or an active Git status refresh detects workspace changes, the system SHALL reload listings for the workspace root and for every currently expanded directory, including paths that were expanded but never successfully listed.

#### Scenario: Refresh reloads open branches

- **WHEN** the user clicks the explorer refresh control with several folders expanded
- **THEN** the explorer reloads entries for the root and each expanded folder

#### Scenario: Active Git refresh reloads open branches

- **WHEN** an active Git status refresh detects a workspace change while several folders are expanded
- **THEN** the explorer reloads entries for the root and each affected currently expanded directory

#### Scenario: Git refresh finds no workspace change

- **WHEN** an active Git status refresh is equal to the previous Git status
- **THEN** the explorer does not perform a redundant full expanded-directory reload

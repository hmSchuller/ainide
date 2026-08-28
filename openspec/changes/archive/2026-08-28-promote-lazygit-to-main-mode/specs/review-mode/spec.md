## ADDED Requirements

### Requirement: Review mode is dedicated to the Difit surface

Review mode SHALL present the Difit review surface without rendering the shell or custom utility terminal footer. Utility terminal sessions remain available from Edit mode, while switching away from Review SHALL preserve the existing review lifecycle rules.

#### Scenario: User opens Review mode

- **WHEN** the user selects Review from the primary mode controls
- **THEN** the Review surface displays its Difit controls or status and no utility terminal footer

#### Scenario: User leaves Review mode

- **WHEN** the user switches from Review to Edit, Agents, or LazyGit
- **THEN** the Review surface follows its existing session reuse behavior and the user can return without Review gaining a utility terminal footer

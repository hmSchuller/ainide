## ADDED Requirements

### Requirement: Review can open from delegation evidence
The system SHALL allow a user to enter a visible Review or Edit inspection surface from a delegation turn, file location, diff, or evidence summary. The inspection surface SHALL identify the originating project, delegation, execution, and baseline scope and SHALL provide a route back to that source.

#### Scenario: User opens a reported file
- **WHEN** the user activates a file location from an agent turn
- **THEN** the application visibly switches to the file inspection surface at the location and offers a return action to the originating delegation and turn

### Requirement: Review supports delegation baselines
For a delegation with a valid Git baseline, Review SHALL support comparing the delegation workspace against that baseline independently from unrelated working-tree, staged, last-commit, or branch scopes. The UI SHALL disclose whether changes are isolated, provider-reported, system-observed, or unattributed shared-workspace activity.

#### Scenario: Isolated delegation is review-ready
- **WHEN** the user opens Review for an isolated delegation
- **THEN** Review compares the delegation worktree against its recorded baseline and does not include unrelated changes from the primary checkout

#### Scenario: Shared checkout attribution is ambiguous
- **WHEN** the user opens delegation review for shared-checkout work with concurrent actors
- **THEN** Review shows the baseline diff as workspace activity and warns that individual authorship cannot be guaranteed

### Requirement: Review outcomes update delegation state explicitly
The system SHALL let the user accept an outcome, request further work, or leave review without deciding. Accepting or requesting changes SHALL create a user-declared evidence record and update the delegation lifecycle without automatically integrating or deleting isolated work.

#### Scenario: User requests changes
- **WHEN** the user returns a review-ready delegation for further work with feedback
- **THEN** the delegation becomes active, the feedback is available to the selected execution as an unsent or explicitly sent prompt, and the prior review decision remains recorded

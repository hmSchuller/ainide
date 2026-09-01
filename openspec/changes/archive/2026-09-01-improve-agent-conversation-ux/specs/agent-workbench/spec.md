## ADDED Requirements

### Requirement: ACP activity history follows a bottom anchor

The Agents workbench SHALL maintain an independent reading-position policy for each rendered ACP conversation history. When the user is at the bottom of a history, new activity SHALL keep the viewport at the latest activity, including activity that grows an existing streamed message. When the user has scrolled away from the bottom, new activity SHALL NOT move the viewport automatically.

#### Scenario: Streaming activity arrives at the bottom

- **WHEN** the user is viewing the bottom of an ACP history and the provider appends activity or streams additional text into an existing activity
- **THEN** the history remains positioned at the latest activity without requiring manual scrolling

#### Scenario: New activity arrives while reading older activity

- **WHEN** the user scrolls upward in an ACP history and new provider activity arrives
- **THEN** the existing viewport position remains stable and the workbench shows a `New activity` affordance for that conversation

#### Scenario: User returns to the latest activity

- **WHEN** the user selects the `New activity` affordance or manually scrolls back to the bottom
- **THEN** the history shows the latest activity, the affordance is cleared, and subsequent activity follows the bottom again

#### Scenario: Two visible conversations have independent positions

- **WHEN** two ACP sessions are visible and the user scrolls one history away from its bottom while leaving the other at its bottom
- **THEN** new activity follows the bottom in the second history without moving the first history

## ADDED Requirements

### Requirement: Primary workbench scroll surfaces use styled scrollbars

The Agents workbench and other primary ainide scroll containers SHALL use a shared styled scrollbar treatment that matches the dark cockpit palette instead of relying on the operating system's default scrollbar appearance. The styled treatment SHALL use a thin rounded thumb, a low-contrast track, and a clearer thumb on hover. The ACP conversation history SHALL use this treatment on its primary scroll container.

#### Scenario: User scrolls a long ACP conversation

- **WHEN** an ACP session history exceeds the visible conversation area
- **THEN** the conversation scroll container shows the shared styled scrollbar rather than the default OS scrollbar

#### Scenario: User hovers the conversation scrollbar

- **WHEN** the user moves the pointer over the conversation history scrollbar thumb
- **THEN** the thumb becomes visually clearer while remaining consistent with the workbench palette

#### Scenario: Nested expandable content scrolls internally

- **WHEN** expanded tool, terminal, code, or unknown-activity content exceeds its local container
- **THEN** the nested scroll area MAY use a lighter variant of the shared scrollbar treatment without changing the primary conversation scrollbar behavior

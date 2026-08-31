## MODIFIED Requirements

### Requirement: Users can select advertised session configuration

The system SHALL display model and other session configuration options returned by the selected ACP agent during session setup or later configuration updates. A manual selection SHALL be scoped to the selected agent session and SHALL be sent using the ACP configuration method with the advertised option identifier and value. After the provider accepts a selection, the system SHALL persist that primitive value as the last-used preference for the selected provider. When starting a new session for that provider, the system SHALL attempt to apply compatible persisted preferences after the provider advertises its options. The system SHALL NOT invent model options when the agent does not advertise them.

#### Scenario: Agent supplies model options

- **WHEN** an ACP session returns a selectable configuration option categorized as a model
- **THEN** the session header exposes the available labels and current value, and choosing another value updates that ACP session without changing other sessions

#### Scenario: A new session reuses a provider preference

- **WHEN** a user starts a new session for a provider with a previously accepted configuration value and the new session advertises a compatible option
- **THEN** the system applies the remembered value through the provider configuration method and displays the provider-reported resulting value without changing existing sessions

#### Scenario: Preferences remain isolated by provider

- **WHEN** a user starts a new session for a different provider
- **THEN** the system does not apply configuration values remembered for another provider

#### Scenario: A remembered value is no longer advertised

- **WHEN** a new session does not advertise a previously remembered option or no longer accepts its value
- **THEN** the system leaves that option at the provider’s current default, keeps the new session usable, and does not display an invented or invalid choice

#### Scenario: Agent has no model selector

- **WHEN** an ACP session does not return a model configuration option
- **THEN** the system shows the provider's current or default model state when available and does not display a misleading universal model list

#### Scenario: Configuration options change

- **WHEN** the agent sends a configuration update or returns a new complete option set after a selection
- **THEN** the session replaces its displayed options and preserves the agent-reported current values

### Requirement: ACP session persistence reflects provider resumability

The system SHALL persist only the local metadata needed to identify an ACP provider session, its project, workspace, display name, and resumability state, together with validated primitive provider-scoped configuration preferences for use by future new sessions. The system SHALL NOT persist ACP authentication secrets, session tokens, provider environment secrets, or live protocol streams. After a server restart, the system SHALL attempt ACP loading or resuming only when the agent advertised the corresponding capability and shall not claim that a non-resumable session was restored. Persisted provider preferences SHALL NOT override the configuration of an existing restored ACP conversation.

#### Scenario: Provider supports session loading

- **WHEN** a persisted ACP session belongs to an agent that advertises session loading or resuming and the provider can authenticate
- **THEN** the system reconnects to the provider and restores the session history or continuation state using the supported ACP method

#### Scenario: Provider cannot resume a persisted session

- **WHEN** a persisted ACP session lacks a supported loading or resuming capability
- **THEN** the system marks the session as non-resumable or offers an explicit new-session action without presenting a new session as the old conversation

#### Scenario: Provider preferences survive a server restart

- **WHEN** a user has successfully selected a provider configuration value, the server restarts, and the user starts a new session for that provider
- **THEN** the system loads the preference from local session state and attempts to apply it to the new provider session

#### Scenario: Restored conversation configuration is preserved

- **WHEN** a persisted ACP conversation is restored after restart and the provider reports its current session configuration
- **THEN** the system preserves the restored conversation’s provider-reported configuration rather than replacing it with the last-used new-session preference

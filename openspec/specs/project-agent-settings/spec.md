# project-agent-settings Specification

## Purpose

Lets a user restrict which globally configured ACP agents are available to a given project, so each project's "start an agent" picker offers only the agents relevant to it, with the choice persisted per project.

## Requirements

### Requirement: A project can disable a subset of configured ACP agents

The system SHALL allow a project to mark any subset of the globally configured ACP agents as disabled for that project. A project with no banlist, or an empty banlist, SHALL have all configured agents enabled. Disabling an agent SHALL NOT remove it from the global configuration; it SHALL only affect that project.

#### Scenario: No banlist means all agents enabled

- **WHEN** a project has no recorded banlist
- **THEN** every configured ACP agent is enabled for that project

#### Scenario: Disabling an agent is per-project

- **WHEN** an agent is disabled for one project
- **THEN** that agent is disabled for that project and remains enabled for every other project and in the global configuration

#### Scenario: Only configured identifiers have effect

- **WHEN** a project's banlist is evaluated
- **THEN** only identifiers that exist in the global ACP agent configuration affect the effective list, and identifiers that are not configured are ignored

### Requirement: The banlist persists in the global configuration

The system SHALL persist each project's banlist in the global ainide configuration, keyed by the project's absolute root path. The configuration SHALL remain backward compatible: a configuration with no per-project section SHALL be treated as having no banlists, so all agents are enabled.

#### Scenario: Banlist survives a restart

- **WHEN** a user disables an agent for a project and the server later restarts
- **THEN** that agent is still disabled for that project

#### Scenario: Legacy configuration without a per-project section

- **WHEN** the global configuration has no per-project section
- **THEN** every project is treated as having all agents enabled

### Requirement: A banlist change takes effect without a restart

The system SHALL apply a banlist change to the running server immediately and persist it to the configuration file, so the user does not need to restart the server for the change to take effect.

#### Scenario: Toggle reflects immediately

- **WHEN** the user disables an agent for the active project through the settings surface
- **THEN** the agent is no longer offered for that project without a restart, and the change is written to the configuration file

### Requirement: The agent-settings operations identify the project by root path

The system SHALL provide an operation to read a project's effective agent list (all configured agents and the set disabled for that project) and an operation to update that project's banlist. The project SHALL be identified by its absolute root path supplied in the request body, and the operations SHALL work for root paths containing characters that are not valid in a URL path segment, including spaces, non-ASCII characters, quotes, and reserved object keys.

#### Scenario: Read a project's effective agents

- **WHEN** the client requests the agent settings for a known project
- **THEN** the response lists all configured agents and the identifiers disabled for that project

#### Scenario: Update a project's banlist

- **WHEN** the client submits a new disabled set for a known project
- **THEN** the project's banlist is updated, persisted, and reflected in subsequent reads

#### Scenario: Root path with special characters

- **WHEN** a project's root path contains spaces, non-ASCII characters, or a reserved object key such as `__proto__`
- **THEN** its banlist can be set, read, and persisted without corrupting or dropping the entry

### Requirement: The agent-settings operations validate their input

The system SHALL reject an agent-settings update whose project root path is not a known or open project, and SHALL give no effect to disabled identifiers that are not configured ACP agents. The system SHALL NOT treat a client-supplied root path as a filesystem path to resolve.

#### Scenario: Unknown project is rejected

- **WHEN** the client submits a banlist for a root path that is not a known or open project
- **THEN** the update is rejected and no configuration entry is created for it

#### Scenario: Unconfigured agent identifier is ignored

- **WHEN** the submitted disabled set contains an identifier that is not a configured ACP agent
- **THEN** that identifier has no effect on the effective agent list

### Requirement: A project settings surface exposes the banlist

The system SHALL provide a per-project settings surface, reachable from the project switcher, that lists every configured ACP agent and lets the user toggle which are disabled for the active project.

#### Scenario: Open project settings

- **WHEN** the user opens the project settings from the project switcher
- **THEN** the surface lists every configured ACP agent with its disabled state for the active project

#### Scenario: Toggle an agent

- **WHEN** the user toggles an agent's disabled state in the project settings
- **THEN** the project's banlist is updated and the change is persisted

### Requirement: The banlist applies to ACP agents and new sessions only

The banlist SHALL apply only to configured ACP agents and SHALL affect only which agents are offered for starting new sessions. The PTY agent command SHALL be unaffected, and already-running ACP sessions SHALL NOT be terminated or altered by a banlist change.

#### Scenario: PTY agent unaffected

- **WHEN** an agent is disabled for a project
- **THEN** the PTY agent command remains available and unchanged for that project

#### Scenario: Running sessions unaffected

- **WHEN** an agent is disabled for a project while it has a running session
- **THEN** the running session continues and is not terminated

## Why

The repository's `AGENTS.md` describes ainide as a terminal-centered cockpit but does not mention its implemented ACP session path. This leaves contributors without the architectural and safety context needed to reason about ACP providers, even though the user-facing README and source code already support them.

## What Changes

- Update `AGENTS.md` to identify ACP-backed conversations alongside PTY terminals as supported agent interfaces.
- Document the distinction between PTY agent sessions and structured ACP sessions.
- Record the local-provider model: ACP providers are configured local commands with direct arguments, remain provider-owned for authentication and model configuration, and are supervised by the ainide server.
- Record the relevant ACP safety and lifecycle constraints, including workspace scoping, session-token protection, explicit permission handling, and session persistence boundaries.
- Keep detailed user setup, configuration examples, and troubleshooting in `README.md` rather than duplicating the full guide in `AGENTS.md`.

## Capabilities

### New Capabilities

None. This is a documentation-only change.

### Modified Capabilities

None. Existing runtime requirements are not changing.

## Impact

- Affected documentation: root `AGENTS.md`.
- No application code, HTTP/WebSocket protocol, configuration parser, dependencies, or runtime behavior changes.
- The documentation should remain consistent with the existing ACP specifications and the ACP sections of `README.md`.

## Why

ACP providers can advertise slash commands through `available_commands_update`, but ainide currently stores that valid notification as an unknown transcript activity. This produces misleading startup noise and prevents users from discovering provider commands and skills, especially the commands OpenCode exposes from its configured skills.

## What Changes

- Recognize ACP `available_commands_update` notifications as session metadata rather than conversation activity.
- Expose the current provider-advertised command names, descriptions, and optional text-input hints through the shared ACP session state and authenticated event snapshots.
- Add session-scoped slash-command autocomplete to the ACP prompt composer.
- Filter suggestions as the user types `/`, and insert the selected command with a trailing space without submitting the prompt.
- Replace the complete command list on dynamic updates, including clearing it when the provider sends an empty list.
- Preserve the existing sanitized unknown-activity fallback for ACP update variants ainide does not understand.
- Keep command invocation as ordinary ACP prompt text; do not add provider-specific command execution or skill-directory scanning.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `acp-agent-sessions`: Handle provider-advertised commands and skills as session state and make them available through slash-command autocomplete in the ACP composer.

## Impact

- `packages/shared`: Add a browser-facing representation for provider-advertised commands and associate the current list with an ACP session.
- `apps/server`: Normalize and publish command updates without adding them to retained conversation history, with bounded safe fields.
- `apps/web`: Store command state, render autocomplete suggestions, and insert selected command text without sending a prompt.
- ACP server, client-state, and workbench tests: Cover startup updates, dynamic replacement, reconnect snapshots, unknown-update fallback, filtering, keyboard selection, and insertion behavior.
- No new endpoint, dependency, provider command, persistence field, or authentication behavior is required.

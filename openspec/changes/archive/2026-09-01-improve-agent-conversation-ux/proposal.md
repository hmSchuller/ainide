## Why

ACP conversations in the Agents workbench currently do not preserve a user's reading position while responses stream, making it easy to lose context when inspecting earlier activity. File references also require leaving the conversation to use the separate reference-kit workflow, even though ACP already supports structured prompt context.

## What Changes

- Keep each ACP conversation pinned to the bottom while the user is at the bottom and new activity arrives, including streamed updates to an existing message.
- Stop automatic scrolling when the user scrolls upward, preserving their position and showing a `New activity` affordance that returns to the latest activity and resumes following.
- Keep scroll state independent for each visible ACP session; raw PTY terminal cards remain unchanged.
- Add `@` file autocomplete to ACP composers using active-workspace file search.
- Ensure active-workspace file listing and search honor that workspace's `.gitignore` rules and built-in ignored directories before results reach ACP suggestions.
- Resolve a selected `@file` to the current disk version as a whole-file draft reference, even when an unsaved editor buffer for that file is open.
- Preserve the visible `@path` mention in the draft and send the captured file as structured ACP context only when the user submits the prompt.
- Expose removable attached-file state and report binary, missing, or unreadable file failures without silently sending a path-only reference.
- Preserve existing slash-command autocomplete, reference-kit handoff, project scoping, and ACP prompt recovery behavior.

## Capabilities

### New Capabilities

<!-- No new capability is needed; this change extends existing Agents and ACP behavior. -->

### Modified Capabilities

- `agent-workbench`: ACP conversation surfaces gain bottom-anchored streaming behavior and a `New activity` return affordance.
- `agent-reference-handoff`: ACP composers can reference whole workspace files with `@` and attach them to the current unsent draft.
- `acp-agent-sessions`: ACP composer autocomplete and structured prompt context gain file-mention behavior while preserving explicit submission boundaries.

## Impact

- `apps/web`: ACP conversation scroll anchoring, activity affordance, file-mention autocomplete, disk-backed file resolution, draft attachment presentation, and focused tests.
- `apps/server`: apply the selected workspace's ignore rules consistently to directory listings and recursive file search; the server repository's own `.gitignore` must not control suggestions.
- `apps/web/src/api.ts` and existing workspace APIs: reuse active-project file search and safe file reads; no generic command or file-execution endpoint is required.
- `packages/shared`: likely no protocol shape change; existing `AcpPromptContext` and `AcpPromptDraft` concepts remain the transport boundary.
- Existing ACP sessions, PTY terminal behavior, reference-kit state, project isolation, and prompt submission/recovery flows must remain compatible.

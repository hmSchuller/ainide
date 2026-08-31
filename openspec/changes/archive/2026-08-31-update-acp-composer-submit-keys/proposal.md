## Why

The ACP composer currently requires `Cmd/Ctrl+Enter` to submit a prompt, which makes ordinary conversational input slower than a standard chat composer. Its draft is also cleared only after the full provider turn completes, so the field does not clear at send time and a later draft can be erased when that turn finishes.

## What Changes

- Make plain `Enter` the primary ACP prompt submission key when command autocomplete is not open.
- Make `Shift+Enter` insert a newline without submitting.
- Preserve autocomplete keyboard behavior: plain `Enter` selects the active suggestion while suggestions are open, and `Tab` remains an alternative; after insertion, the next plain `Enter` submits.
- Retain `Cmd/Ctrl+Enter` as a compatible explicit submit alias and update the composer send affordance to advertise the primary `Enter` behavior.
- Clear the submitted draft optimistically when a prompt is dispatched, including attached references, so the composer is immediately ready for another prompt.
- Restore the submitted draft when dispatch fails, without overwriting text the user entered after the optimistic clear.
- Preserve the existing no-submit behavior for empty, authentication-blocked, or already-active prompts and avoid submitting while an IME composition is in progress.

## Capabilities

### New Capabilities

### Modified Capabilities

- `acp-agent-sessions`: Change ACP composer keyboard submission and draft lifecycle behavior while preserving session-scoped command autocomplete.

## Impact

- `apps/web/src/components/AgentWorkbench.tsx`: ACP composer keyboard handling, optimistic draft lifecycle, and send affordance.
- `apps/web` tests: Cover send/newline key combinations, autocomplete precedence, prompt failures, and preservation of a replacement draft.
- No new endpoint, dependency, provider protocol behavior, or persisted data is required.

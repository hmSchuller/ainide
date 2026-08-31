## Why

Creating an ACP agent currently requires two native prompts: the user must invent a session title and then type a provider identifier, with `pty` as a special fallback. This makes the primary agent-launch path slow and error-prone even though ainide already knows the configured providers, and it prevents ACP providers from supplying the conversation title they know best.

## What Changes

- Replace the title and free-form provider prompts with an in-app picker containing only configured ACP providers and their display labels.
- Start the selected provider immediately after the user chooses it; do not expose a PTY option or silently fall back to a terminal agent from this flow.
- Do not auto-create an agent PTY when opening or switching projects. When the active project has no actual PTY or ACP agent session, Agents mode shows its empty state instead of presenting a synthesized terminal agent.
- Make the user-supplied title optional for new ACP sessions and use a provider label as a provisional display title until the provider sends an ACP-generated title.
- Apply provider-generated titles from `session_info_update` and make accepted title changes visible to the browser and local session persistence.
- Track title ownership so an explicit user rename remains authoritative and later provider title updates cannot overwrite it, including after restart restoration.
- Handle provider loading, an empty configured-provider list, startup failures, and session-creation races without duplicating or replacing existing sessions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `acp-agent-sessions`: Start sessions from a configured-provider picker without requiring a user title, support provider-generated titles, and preserve explicit rename ownership.
- `agent-workbench`: Launch ACP sessions through the provider picker while retaining visible, renameable session titles and reliable session creation behavior.

## Impact

- `apps/web`: Add provider-picker state and UI, replace native launch prompts, and reconcile asynchronous ACP creation and title updates.
- `apps/server`: Expose the existing configured-provider list for the picker, accept title-less creation with a safe provisional title, publish and persist provider title updates, and preserve user title overrides.
- `packages/shared`: Extend ACP session and persisted descriptor metadata with title ownership needed for restart-safe rename precedence.
- ACP API, WebSocket, persistence, and workbench tests: Cover provider-only selection, immediate launch, empty and failed providers, generated titles, rename precedence, restart behavior, and creation races.
- No new dependency or provider integration is introduced. Explicit PTY creation remains available elsewhere, while project startup no longer creates an agent PTY solely to populate the workbench.

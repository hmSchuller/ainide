## Context

The ACP composer is a controlled textarea whose text and attached references are stored per session in the Zustand project UI state. Its current submit handler builds the prompt, awaits `promptAcpSession`, and clears the draft only after the HTTP request resolves. The server-side prompt call remains pending until the provider turn finishes, while the browser can continue receiving and editing session state during that time.

The composer also owns caret-aware provider-command autocomplete. Plain `Enter` currently selects a visible suggestion, so submission behavior must be ordered around that existing interaction rather than layered on top of it.

## Goals / Non-Goals

**Goals:**

- Make keyboard submission predictable for ordinary text, multiline text, autocomplete, IME input, and sessions that cannot currently accept a prompt.
- Clear the exact submitted draft immediately, without waiting for provider completion.
- Recover a failed submission without overwriting a new draft or attached references entered after the clear.
- Keep the change browser-local and compatible with the existing ACP API and transient draft state.

**Non-Goals:**

- Queueing prompts while an ACP turn is active.
- Changing the server prompt endpoint or making provider turns resolve earlier.
- Changing provider command discovery, command invocation, or PTY terminal keyboard behavior.
- Persisting submitted drafts or introducing a new draft data model.

## Decisions

### 1. Give keyboard events explicit precedence

Handle composer key events in this order:

1. Ignore submit handling while an IME composition is active.
2. Treat `Shift+Enter` as native textarea newline insertion, even when suggestions are visible.
3. When suggestions are open, use plain `Enter` to select the active suggestion and use `Tab` as the existing alternative.
4. When suggestions are closed, use plain `Enter` to submit a valid draft.
5. Continue accepting `Cmd/Ctrl+Enter` as an explicit submit alias when autocomplete does not claim the event.

This preserves the existing slash-command keyboard flow: selecting a command inserts a trailing space and closes completion, after which `Enter` submits the completed prompt. Shifted Enter is handled before completion selection so it cannot accidentally submit or replace a command token.

The handler will only suppress the browser's default Enter behavior when it is actually selecting a suggestion or submitting a prompt. Empty, authentication-blocked, or already-active sessions will not invoke submission; their draft contents will not be cleared. The send button remains available for pointer and mobile use, with its label describing the primary Enter shortcut.

### 2. Snapshot, clear, then dispatch

Before dispatch, derive the exact payload from a snapshot of the current draft, including the trimmed prompt text, reference context, and the original untrimmed draft values needed for recovery. Clear the session draft synchronously before awaiting `promptAcpSession`. This makes the controlled textarea and attached-reference indicator update immediately and permits a subsequent draft while the provider turn is running.

The existing server contract can remain unchanged: the client does not need to wait for the provider turn to know that it has begun dispatching. The prompt payload must be built before clearing because the draft store no longer contains its references afterward.

### 3. Recover only into an empty composer

On dispatch failure, inspect the current session draft before restoring the snapshot. Restore the submitted text and references only if the composer is still empty. If the user has entered text or attached references after the clear, leave that replacement draft untouched and show the existing error notice. A successful request never restores the snapshot.

This uses visible current state as the recovery boundary rather than merging two prompts or replacing newer content. Restoration retains the original draft exactly, including whitespace, while the provider receives the existing trimmed payload. The global reference kit is not changed; only references attached to the submitted ACP draft are consumed and recovered.

### 4. Keep state and transport unchanged

The change remains within the existing ACP conversation surface and `acpDrafts` store actions. It does not add an API endpoint, server event, persisted field, or provider-specific protocol behavior. Keyboard decision logic and draft recovery logic should be kept small and independently testable, following the existing web test style without adding a test framework dependency.

## Risks / Trade-offs

- **A prompt request can fail after the composer is cleared.** -> Restore the exact submitted draft only when current draft state is empty; otherwise preserve the replacement and surface the existing error notice.
- **The user can type while the provider turn is active.** -> Never clear again when the request resolves, and do not overwrite replacement content during success or failure handling.
- **A provider command suggestion competes with Enter-to-send.** -> Give visible completion plain Enter precedence and rely on the inserted trailing space to close completion before a command prompt is sent.
- **A key event can race an `activePrompt` WebSocket update.** -> Recheck submit eligibility in the submission path and retain the existing server-side active-prompt rejection as the final guard.
- **IME confirmation may emit an Enter key event.** -> Bypass submit handling while the native event reports composition in progress.
- **A draft can be empty after the user typed and deleted replacement text.** -> Recovery is intentionally based on the observable empty state specified for this change; it never merges old and new content or overwrites non-empty replacement state.

## Migration Plan

1. Update the ACP composer keyboard and optimistic draft handling in the web client.
2. Add focused tests for the keyboard precedence matrix and successful, failed, and replacement-draft submission paths.
3. Verify typechecking and the existing web test suite; manually check command autocomplete, multiline entry, reference-only prompts, and a delayed provider turn.
4. Rollback requires only reverting the web client change. No server migration or persisted-data cleanup is required.

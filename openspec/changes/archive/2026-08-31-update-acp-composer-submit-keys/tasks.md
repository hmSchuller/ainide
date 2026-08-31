## 1. ACP Composer Keyboard Behavior

- [x] 1.1 Add ordered ACP composer key handling for IME composition, `Shift+Enter` newline insertion, autocomplete suggestion selection, plain `Enter` submission, and `Cmd/Ctrl+Enter` alias; verify the keyboard behavior tests cover each precedence path and never submit during composition.
- [x] 1.2 Preserve session-scoped autocomplete insertion and update the composer send affordance to advertise `Enter` as the primary shortcut; verify selecting a suggestion still inserts `/<name> ` without submitting and the next plain `Enter` submits the completed prompt.
- [x] 1.3 Keep submit guards for empty drafts, authentication-required sessions, and active prompts while avoiding unnecessary default-event suppression; verify guarded key presses neither call the prompt API nor clear draft state.

## 2. Optimistic ACP Draft Lifecycle

- [x] 2.1 Snapshot the exact ACP draft, build its trimmed prompt and reference context before clearing, and clear the session text and attached references before awaiting prompt completion; verify a deferred prompt request leaves the composer immediately empty and preserves the submitted payload.
- [x] 2.2 Add failure recovery that restores the submitted snapshot only when the current composer remains empty, while preserving replacement text or references entered after clearing; verify API rejection tests cover both restoration and replacement preservation.
- [x] 2.3 Ensure successful completion never clears or restores a newer draft after the optimistic clear; verify a delayed successful request leaves replacement content unchanged.

## 3. Focused Coverage

- [x] 3.1 Extend the existing web composer test strategy with testable keyboard and submission-lifecycle seams without adding a test framework dependency; verify tests assert prompt calls, event outcomes, draft state, attached references, and error notices.
- [x] 3.2 Add coverage for multiline drafts, reference-only prompts, whitespace-preserving failure restoration, autocomplete-open Enter behavior, Shift+Enter, modifier aliases, and IME composition; verify the complete ACP composer test set passes.

## 4. Integration Verification

- [x] 4.1 Manually verify an ACP session with a delayed provider turn can accept a new draft immediately after send, that a failed dispatch recovers safely, and that command autocomplete remains usable; record the observed behavior alongside automated results.
- [x] 4.2 Run `npm run typecheck` and `npm test` from the repository root; verify both complete successfully without changes to server protocol, persistence, or unrelated terminal behavior.

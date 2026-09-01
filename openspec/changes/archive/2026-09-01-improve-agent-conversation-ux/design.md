## Context

See `proposal.md` for the motivation. The current ACP conversation renders a Zustand history array inside an independently scrollable `.acp-history` element, but it has no scroll-position ownership or reaction to history updates. ACP message chunks are coalesced into an existing activity item, so a correct implementation must react to history changes even when the number of rendered items is unchanged.

The composer already tracks caret position for slash-command completion and stores unsent text plus `ReferenceItem` attachments in `AcpPromptDraft`. The web client already has active-project `searchFiles` and safe `readFile` APIs, and the ACP request model accepts structured `AcpPromptContext`. The shared reference kit is separate browser state and must not be populated by direct `@` mentions.

## Goals / Non-Goals

**Goals:**

- Make each ACP history independently bottom-following while preserving deliberate upward reading.
- Give detached histories a clear, user-triggered path back to the latest activity.
- Add file mentions without regressing provider slash commands, keyboard submission, or draft recovery.
- Capture the disk version at file-selection time and retain it as explicit, unsent draft context until submission.
- Keep active-project and local-first boundaries enforced by existing APIs.

**Non-Goals:**

- Changing xterm scrolling or raw PTY agent behavior.
- Adding a new server command-execution or file-search protocol.
- Reading unsaved Monaco content for `@` mentions.
- Persisting `@` attachments in disk-backed session snapshots.
- Automatically submitting a prompt after a file is selected.

## Decisions

### 1. Own scroll anchoring inside each ACP conversation

Each `AcpConversation` will own a history-element ref, a follow-bottom flag, and a small pending-activity state. The scroll handler determines whether the element is at or sufficiently near its bottom. A history update then follows the bottom only when that flag is set; otherwise it leaves `scrollTop` unchanged and exposes `New activity` for that conversation.

The update effect will depend on the history value or its latest rendered content, not only on `history.length`, so streamed message and tool-call updates are covered. The initial state follows the bottom so a restored conversation opens on its latest activity. Clicking `New activity`, or manually reaching the bottom, clears the pending state and resumes following.

This is preferred over a global Agents-level scroll controller because the focused and pinned ACP cards can be at different positions. PTY cards remain owned by xterm and are not changed by this feature.

### 2. Keep file completion separate from provider command completion

Add pure file-token matching, filtering, and insertion helpers alongside the existing slash-command helpers instead of generalizing the command implementation. The composer will choose the completion mode at the caret, while retaining the current keyboard precedence for the active completion list: plain `Enter` or `Tab` selects, `Escape` dismisses, and `Shift+Enter` inserts a newline.

File suggestions will use already loaded workspace files for an empty query when available and the existing recursive active-project file search for a non-empty query. Results will be scoped and ranked in the browser without introducing a new endpoint. Debounced requests will use a request identity check so an older search cannot replace newer suggestions.

### 3. Resolve mentions into explicit draft references

Selecting a file will read it through the existing authenticated file API, reject binary results, and create a whole-file `ReferenceItem` from the returned disk content and inferred language. The current draft text will receive an `@workspace-relative/path ` insertion at the original caret position, while the reference is added to that ACP session's draft only.

The selection operation will complete before attaching the reference. If the draft changed while the read was in flight, the insertion will be abandoned rather than attaching content to the wrong token. A failed read will leave the draft usable and report the failure. Repeated selection of the same whole file in one draft will avoid duplicate context items while preserving the user's visible prompt text.

The composer will show attached references as removable, compact items. Removing an `@`-created item removes its context and the corresponding generated mention when it is still present; if the user has edited that text, the visible text remains ordinary prompt text and the context removal is explicit. References added from the shared kit remain removable draft attachments but never mutate the kit.

### 4. Reuse the existing prompt boundary

No new ACP transport shape is needed. `prepareAcpPromptSubmission` will continue to construct the prompt text and context from the draft, so file contents are transmitted only by the existing explicit prompt request. Optimistic clear and failure restoration continue to operate on the complete text-plus-reference draft snapshot.

The disk content is captured when the user selects the file, not when the prompt is eventually submitted. This makes the attachment deterministic and honors the explicit disk-version decision even if the file changes later or an unsaved editor tab exists.

### 5. Test pure behavior separately from browser layout

Keep autocomplete token and insertion rules in unit-testable helpers. Extract or isolate bottom-distance and follow-state calculations so tests can cover exact-bottom, tolerance, detached, and resumed states without requiring a DOM test environment. Extend composer and workbench tests for draft context, error handling, independent attachment state, and preservation of existing slash-command behavior.

The existing web test environment is Node-only, so visual scrolling and keyboard interaction should also be included in the acceptance checklist using the built application rather than adding a browser-testing dependency for this focused change.

## Risks / Trade-offs

- **Risk:** A large disk file may make a prompt exceed the provider or server context limit. -> **Mitigation:** Preserve existing ACP request-size validation, expose attachment size with the draft item, and retain the existing failed-submit recovery path.
- **Risk:** Search responses can arrive out of order while a user types. -> **Mitigation:** Debounce lookups and ignore responses that no longer match the current session, project, and query.
- **Risk:** A file can change after it is selected, making the context stale. -> **Mitigation:** Capture and display the disk snapshot at selection time so the user can remove and reselect it intentionally.
- **Risk:** Users may expect an open unsaved buffer to be referenced. -> **Mitigation:** Keep the `@` path visible and label the attachment as the disk version; retain existing editor actions for visible-buffer references.
- **Risk:** Scroll anchoring can jump during streamed layout changes or near the bottom. -> **Mitigation:** Use a small bottom tolerance, update after rendering, and make the explicit `New activity` action the recovery path when the user is detached.
- **Risk:** Attachment removal can leave a manually edited `@path` token. -> **Mitigation:** Remove the generated token when it can be identified and make the remaining text visibly ordinary prompt content when it cannot.

## Migration Plan

No server or persisted-data migration is required. Existing drafts without file mentions remain valid, existing reference-kit contents retain their current behavior, and raw PTY sessions are unaffected. The new client uses endpoints and ACP context fields already supported by the current server.

Rollback consists of deploying the previous web client. Any in-memory `@` draft attachments disappear with that client state, while no disk snapshot or provider session metadata is changed.

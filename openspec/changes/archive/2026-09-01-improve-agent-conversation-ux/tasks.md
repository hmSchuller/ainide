## 1. ACP History Scroll Policy

- [x] 1.1 Add a unit-testable bottom-distance and follow-state policy with a small tolerance for fractional or layout-dependent scroll positions, and verify exact-bottom, near-bottom, detached, and resumed states with focused web tests.
- [x] 1.2 Wire independent history-element state into each `AcpConversation`, following the bottom after appended activity and coalesced streamed updates while preserving `scrollTop` after upward scrolling; verify updates to an existing message do not lose the follow behavior.
- [x] 1.3 Add the accessible `New activity` affordance, bottom-resume behavior, and responsive styling for detached ACP histories, and verify the control is isolated per visible ACP card and disappears after returning to the latest activity.

## 2. File Mention Completion

- [x] 2.1 Add pure `@` token matching, active-workspace result filtering/ranking, and caret-preserving insertion helpers without changing slash-command helpers, and verify start-of-prompt, post-whitespace, partial-query, surrounding-text, and no-match cases.
- [x] 2.2 Integrate `@` suggestions into ACP composers using loaded workspace files for an empty query and debounced active-project file search for non-empty queries, ignoring stale responses after query, session, or project changes; verify suggestions never include hidden-project files.
- [x] 2.3 Preserve composer keyboard precedence across file and slash suggestions, including Enter/Tab selection, Escape dismissal, Shift+Enter newline, and ordinary Enter or Cmd/Ctrl+Enter submission; verify all existing slash-command tests continue to pass.

## 3. Disk-Backed ACP Draft References

- [x] 3.1 Resolve a selected file through the existing authenticated disk-read API, reject binary or unreadable content, and create a whole-file draft reference with workspace-relative path and language while ignoring unsaved editor buffers; verify disk-version, binary, missing-file, and read-failure cases.
- [x] 3.2 Insert the visible `@path` mention at the captured caret while attaching the reference only to the current ACP draft, guard against draft changes during asynchronous reads, and avoid duplicate whole-file context items; verify surrounding text and concurrent draft edits are preserved safely.
- [x] 3.3 Render compact removable draft attachments and remove the generated mention when identifiable, while keeping shared reference-kit state unchanged; verify selecting, removing, clearing, and repeating `@` references affects only the ACP draft.
- [x] 3.4 Route selected file attachments through the existing prompt preparation and optimistic-clear/recovery flow, transmitting content only on explicit submission; verify the request contains text plus context, no prompt is sent on selection, and failed submission restores an untouched draft.

## 4. Regression And Acceptance Verification

- [x] 4.1 Extend Agents and ACP component/state tests for two visible ACP sessions with independent scroll state, active-project scoping, transient draft attachments, preserved PTY behavior, and unchanged reference-kit behavior.
- [x] 4.2 Run `npm run typecheck` and `npm test` from the repository root and resolve any failures introduced by the change.
- [x] 4.3 Exercise the browser acceptance matrix: streaming while at the bottom follows automatically, scrolling upward shows `New activity` without jumping, the control resumes following, `@` selects disk-backed files, unsaved buffers are ignored, errors are visible, slash commands still work, and no prompt is sent before explicit submission.

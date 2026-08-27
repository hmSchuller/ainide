## 1. Shared Session Contracts

- [x] 1.1 Extend shared mode and project-session types with the `agents` mode and optional per-agent session descriptors containing only the metadata needed for recreation; verify `npm run typecheck -w @ainide/shared` passes.
- [x] 1.2 Preserve compatibility for snapshots that only contain terminal kinds while distinguishing multiple agent descriptors from non-agent tool kinds; verify shared snapshot parsing tests cover missing, single, and multiple descriptors.

## 2. PTY Lifecycle And Restoration

- [x] 2.1 Update session snapshot parsing, sanitization, and serialization to round-trip multiple agent titles without writing tokens, PTY IDs, process IDs, scrollback, commands, or reference-kit content; verify the serialized JSON tests contain no forbidden fields.
- [x] 2.2 Restore every recorded agent descriptor as a new PTY using the current configured agent command, while retaining the legacy terminal-kind fallback for older snapshots; verify a startup test creates two separately titled agents and an older snapshot still restores one recorded agent kind.
- [x] 2.3 Ensure creating, listing, selecting, renaming, and closing multiple same-kind agent sessions never deduplicates or replaces a sibling session; verify server tests cover two live agents and close-by-project behavior.
- [x] 2.4 Support reference insertion through the existing authenticated terminal WebSocket input path, including active-project ownership validation, without adding a generic command-execution HTTP endpoint; verify a protocol test rejects stale or cross-project targets and accepts input without adding a newline.

## 3. Reference Capture And Serialization

- [x] 3.1 Add reference capture for a Monaco selection and a whole text file, normalizing selected content to inclusive line ranges and using the visible buffer when it differs from disk; verify tests cover selected lines, whole files, unsaved visible content, binary files, and read failures.
- [x] 3.2 Add per-project browser-lifetime reference-kit state with stable ordering, individual removal, clearing, and project swap behavior; verify store/helper tests show that separate project kits do not mix and that kit state is absent from disk snapshots.
- [x] 3.3 Implement deterministic plain-text serialization for one reference and a multi-file kit with path, line scope, language/content boundaries, and repeatable output; verify serializer tests cover ordering, whole-file markers, line ranges, and content containing fence-like text.
- [x] 3.4 Add clipboard operations for direct reference copy and kit copy that do not mutate source buffers or consume kit items; verify browser-facing helper tests preserve the kit after repeated copies and report clipboard failures without losing it.

## 4. Web State And Terminal Presentation

- [x] 4.1 Add Agents to the web mode state and project UI bags, preserving the existing Edit/Review state and per-project mode restoration; verify project UI tests cover entering Agents, switching away, and returning without losing terminal identity.
- [x] 4.2 Refactor terminal presentation so agent sessions have a dedicated full-height workbench while PTYs remain alive across mode changes and project switches; verify component/integration tests show that changing modes does not close or recreate a live agent.
- [x] 4.3 Add focused-session and optional second-pinned-session state with independent terminal mounts and tool-session selection; verify tests cover one-session focus, two-session observation, unpinning, and reattachment with scrollback.
- [x] 4.4 Keep shell, Lazygit, and custom sessions accessible as secondary tools in the Agents workbench without counting them as agents; verify the UI distinguishes agent and tool sections and preserves existing tool launch/close behavior.

## 5. Agent Workbench UI

- [x] 5.1 Add the primary Agents mode control beside Edit and Review, including an active-project agent count/status indicator and existing keyboard/command-palette access; verify UI tests cover empty, single-agent, and multi-agent navigation states.
- [x] 5.2 Build the Agents session navigator with user-visible titles, live/exited status, create-agent action, rename action, close action, and selected-session output; verify tests cover naming an Implement and Plan next task session and retaining exited output.
- [x] 5.3 Add optional two-agent side-by-side layout with a usable narrow-screen treatment and a default focused view; verify the responsive acceptance test shows both selected sessions at wide widths and remains usable without unreadable compression at narrow widths.
- [x] 5.4 Replace the terminal footer as the primary agent interaction surface while retaining a compact utility treatment for non-agent terminals; verify the rendered workbench has no bottom-only dependency and Edit/Review remain usable.

## 6. Reading And Handoff UX

- [x] 6.1 Add code-surface actions for Copy as reference, Add selection to kit, and Copy file as reference, plus file/tab actions for whole-file references; verify UI tests cover selection and whole-file actions without saving or changing the active buffer.
- [x] 6.2 Add the compact Edit-surface reference dock showing kit items, counts, target agent, remove/clear controls, Copy kit, and Paste reference kit actions; verify a read-and-handoff flow completes without leaving the current file.
- [x] 6.3 Add agent-target selection shared by the code dock and Agents workbench, with explicit insertion that sends no trailing newline or submit action and retains clipboard fallback when no live target exists; verify an integration test confirms the target receives text while a sibling agent receives nothing.
- [x] 6.4 Keep reference kits and target selection scoped to the active project while hidden project agents continue running; verify switching projects swaps kits and session lists and switching back does not duplicate agents or leak references.

## 7. Bootstrap And Persistence Integration

- [x] 7.1 Extend project snapshot creation and bootstrap/reconnect flows to record and restore multiple agent descriptors while excluding reference kits and transient target state; verify browser reconnect attaches existing PTYs and process restart creates new titled PTYs.
- [x] 7.2 Ensure existing active-project event filtering, Review behavior, dirty-buffer handling, and project switching remain unchanged when Agents mode is active; verify focused regression tests cover hidden-project events, review switching, and unsaved buffers.

## 8. Verification

- [x] 8.1 Run `npm run typecheck` and `npm test` from the repository root and resolve failures introduced by the change.
- [x] 8.2 Exercise the acceptance matrix: two named agents run concurrently, both can be observed, references can be copied and inserted without submission, tools remain available, agents survive mode/project/browser switches, kits stay project-scoped and transient, and multiple titled agents recreate after process restart; record the result in this task file.

Acceptance result (2026-08-27): PASS. `npm run build`, `npm run typecheck`, and `npm test` passed. Server coverage verifies concurrent named PTYs, active-project isolation, exact no-newline handoff input, reconnect/scrollback retention, and restart recreation. Web coverage verifies focused/pinned project state, transient project-scoped kits, visible-buffer capture, deterministic serialization, repeatable clipboard operations, and the responsive Agents workbench implementation.

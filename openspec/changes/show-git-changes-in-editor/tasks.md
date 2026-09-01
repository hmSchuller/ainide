## 1. Shared Protocol and Git Semantics

- [ ] 1.1 Extend the shared Git models with the current `HEAD` identity, preserved rename source path, and file-comparison baseline/state metadata; verify the shared package builds and existing Git consumers typecheck.
- [ ] 1.2 Update Git status parsing and collection to report `HEAD` identity and retain old paths for renames while preserving existing file statuses and aggregate counts; verify focused Git parser tests cover ordinary, renamed, detached, and unborn repositories.
- [ ] 1.3 Implement fixed local Git baseline retrieval for tracked, untracked, deleted, renamed, binary, conflicted, non-repository, and no-`HEAD` files; verify server-side Git tests cover content, empty-baseline, and unavailable-state behavior.

## 2. Safe File-Comparison API

- [ ] 2.1 Add an active-workspace comparison operation and authenticated API route that accepts only a relative path and compares against the server-selected `HEAD`; verify server tests reject missing tokens, absolute paths, traversal, symlink escapes, and inactive-project access before any comparison operation.
- [ ] 2.2 Return stable comparison metadata and textual baseline content without exposing arbitrary revisions, commands, inactive project roots, or binary contents; verify route tests cover response shapes for clean, changed, untracked, deleted, renamed, and exceptional files.

## 3. Client Comparison State

- [ ] 3.1 Add transient per-project comparison state keyed by path and `HEAD` identity, including loading, unavailable, and error states; verify project switching and obsolete token/request responses cannot update the active project's state.
- [ ] 3.2 Implement a deterministic line-based diff helper that returns addition, modification, and deletion ranges with anchors for beginning, middle, and EOF deletions; verify unit tests cover empty files, repeated lines, replacements, insertions, deletions, and mixed hunks.
- [ ] 3.3 Integrate comparison loading with file opening, visible-buffer edits, Git status reconciliation, and `HEAD` invalidation; verify tests show unsaved buffers update markers locally, disk reloads recalculate markers, and dirty conflicts retain the visible buffer.

## 4. Edit Surface Experience

- [ ] 4.1 Apply and dispose line-level editor gutter decorations for the active file in either editor pane; verify markers update after edits, clear when the buffer matches `HEAD`, and do not leak across tab, pane, or project changes.
- [ ] 4.2 Add an explicit per-file Git diff action that opens a read-only side-by-side `HEAD` versus `CURRENT BUFFER` view and identifies unsaved content; verify opening and closing the view preserves tab content, dirty state, conflict state, pane ownership, and editor layout.
- [ ] 4.3 Render truthful states for clean, untracked, deleted, renamed, conflicted, binary, non-repository, and no-`HEAD` files; verify no misleading ordinary markers or text diff is offered where the baseline is unavailable.
- [ ] 4.4 Keep the detailed diff usable in both split panes and on narrow screens without changing existing tab, auto-save, conflict, reference, or Review-mode behavior; verify focused web tests and a manual responsive smoke check.

## 5. Verification

- [ ] 5.1 Run the focused server and web test suites and verify Git baseline retrieval, path safety, line-diff ranges, polling reconciliation, unsaved buffers, exceptional states, and pane behavior pass.
- [ ] 5.2 Run `npm run typecheck` from the repository root and verify shared, server, and web protocol changes introduce no TypeScript errors.
- [ ] 5.3 Run `npm run build` from the repository root and verify the production bundle includes the editor comparison surface without build or bundling regressions.
- [ ] 5.4 In the running app, open tracked, untracked, renamed, and deleted text files, edit before auto-save, inspect gutter markers and the detailed diff in both panes, trigger an external change, switch projects, and verify no stale markers or buffer mutations remain.

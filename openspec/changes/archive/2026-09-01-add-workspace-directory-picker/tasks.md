## 1. Path Resolution And Protocol

- [x] 1.1 Add shared directory-picker response types for canonical current and parent paths, the server home path, and immediate child directory metadata; verify the shared package builds successfully.
- [x] 1.2 Add server-side tilde expansion and canonical path normalization shared by project opening and directory browsing; verify `~`, nested `~/...`, absolute paths, unsupported `~other-user`, relative paths, and platform separators in focused unit tests.
- [x] 1.3 Add an authenticated pre-workspace directory-children route that validates the requested directory, lists only immediate child directories, supports a final-segment query, includes hidden and accessible symlinked directories, and returns no file data; verify route responses and error statuses with server tests.
- [x] 1.4 Verify directory browsing permits existing readable paths outside the home directory while respecting operating-system permissions and never invokes project activation, session persistence, or command execution.

## 2. Directory Picker Surface

- [x] 2.1 Add the web API client and path-display helpers for directory-children requests, server-home rendering as `~`, canonical parent navigation, and platform path separators; verify helper tests cover home, root, parent, nested, and malformed paths.
- [x] 2.2 Replace the path-only picker state with a home-rooted browser that loads home children on every mount and reset, navigates one level per child selection, and provides Home, Parent, current-path, and explicit Open project controls; verify component tests cover first launch and repeated Open another sessions.
- [x] 2.3 Add final-segment directory suggestions backed only by the relevant parent directory, with arrow-key selection, Tab completion, Enter behavior, and accessible combobox/listbox semantics; verify suggestions never contain descendants or unrelated paths.
- [x] 2.4 Add request-generation handling, loading states, empty states, permission and missing-path errors, and protection against stale responses overwriting newer navigation; verify focused asynchronous picker tests cover out-of-order responses and recoverable failures.
- [x] 2.5 Add responsive picker styling that keeps recent shortcuts, path navigation, immediate child folders, and manual entry usable on desktop and mobile; verify the web build and picker rendering tests pass.

## 3. Application And Recent-Project Integration

- [x] 3.1 Connect the directory picker to both the no-workspace surface and the Open another modal while preserving profile-local recent projects as direct-open shortcuts; verify both surfaces start at `~` and recent selection bypasses browsing.
- [x] 3.2 Remove browser `ainide:last-workspace` reads and writes from picker initialization and successful project flows without changing server-side session snapshots; verify profiles with no recents start at `~` and existing stored last-workspace values are ignored.
- [x] 3.3 Preserve successful-open-only recent recording and unchanged recent state for directory navigation, completion, failed browsing, and failed project opening; verify integration tests cover successful, failed, repeated, and recent-project operations.
- [x] 3.4 Keep the existing project-open, project-switch, server-global active-project, PTY, and session persistence semantics unchanged; verify existing project, terminal, and session test suites continue to pass.

## 4. Documentation And Verification

- [x] 4.1 Document tilde-aware paths, home-rooted picker sessions, one-level directory discovery, manual path entry, and the absence of browser-profile active-project isolation; verify the usage documentation matches the implemented behavior.
- [x] 4.2 Run the focused server and web test suites and `npm run typecheck`; verify directory browsing, picker interactions, recents, and the unchanged project contract all pass.
- [x] 4.3 Run `npm run build`; verify the shared protocol, server, and web production builds complete without generated artifacts being added to the change.

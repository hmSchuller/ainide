## 1. Browser-Profile Recent Storage

- [x] 1.1 Add a web-side recent-project storage helper with a dedicated browser-local key, validated project metadata, and safe read/write behavior; verify it returns an empty list for missing, malformed, or unavailable storage.
- [x] 1.2 Implement pure recent-entry ordering and deduplication using the resolved project identity, refreshing metadata and moving successfully remembered projects to the front; verify duplicate aliases resolve to one ordered entry in focused unit tests.
- [x] 1.3 Add focused storage tests covering independent mock browser-profile stores, most-recent ordering, malformed entries, and storage write failures; verify the tests pass without requiring a server.

## 2. Workspace Picker Integration

- [x] 2.1 Load the current profile's recent projects at web-app startup and pass them to both workspace-picker surfaces; verify the picker shows only profile-local entries in the stored order and does not import the server's global known-project list.
- [x] 2.2 Preserve the manual absolute-path input and use the existing `last-workspace` value only as the initial path hint when no profile-local recents exist; verify empty-list and fallback rendering in web tests.
- [x] 2.3 Record the canonical project returned by each successful user-initiated open or switch, while leaving recent storage unchanged on failures and avoiding bootstrap restoration as a new recent; verify successful, failed, and repeated project operations in focused tests.
- [x] 2.4 Keep the existing top-bar live-project switcher and server-global project semantics unchanged; verify the change introduces no API, shared-type, or session-snapshot modifications.

## 3. Documentation And Verification

- [x] 3.1 Document that recent projects are isolated by browser profile but active projects and PTYs remain server-global when profiles share one ainide server; verify the usage and local-first documentation matches the implemented boundary.
- [x] 3.2 Run the relevant web test suite and `npm run typecheck`; verify profile-local recent behavior, existing project switching, and the unchanged server contract all pass.

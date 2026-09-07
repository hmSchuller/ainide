## 1. Mode-aware workbench layout

- [x] 1.1 Add Review-mode workbench chrome state and suppress both the ainide explorer wrapper and its separate resize splitter while Review is active; verify in a browser smoke check that the Review surface expands across the former explorer width and the explorer remains visible in Edit, Agents, and LazyGit.
- [x] 1.2 Dismiss the mobile explorer drawer and other transient explorer presentation when entering Review without clearing project-local explorer data; verify that an open mobile drawer cannot overlay Review and that width, expanded directories, cached listings, and selected path return unchanged after leaving Review.

## 2. Verification

- [x] 2.1 Add or update focused web tests for Review-mode layout transitions and explorer-state preservation, including desktop and mobile behavior; verify the tests pass.
- [x] 2.2 Run the relevant web typecheck, test suite, and production build; verify no server, shared-protocol, Review lifecycle, or workspace file-operation behavior regresses.

## 1. Terminal State Transitions

- [x] 1.1 Update the terminal maximize-state transition so entering maximized mode forces expansion, while clearing maximized mode preserves the current collapsed state and does not overwrite the local preference; verify with focused store tests.
- [x] 1.2 Update the terminal collapse control to clear maximized state only when necessary and leave the requested collapsed state as the final result; verify expanded-to-collapsed and maximized-to-collapsed behavior.

## 2. Regression Coverage

- [x] 2.1 Add a web store test for expanding then collapsing the terminal panel, asserting in-memory state and `ainide:terminal-collapsed` persistence; verify the test fails against the current regression and passes after the fix.
- [x] 2.2 Add web store coverage for maximizing, restoring, and collapsing the panel, asserting that maximizing expands, restoring preserves state, and collapsing a maximized panel persists as collapsed; verify all transition cases pass.
- [x] 2.3 Confirm the existing session snapshot tests still exclude terminal collapse state; verify the relevant layout and project UI tests pass.

## 3. Verification

- [x] 3.1 Run `npm run typecheck` from the repository root and verify shared, server, and web typechecks pass.
- [x] 3.2 Run `npm test` from the repository root and verify the complete server and web test suites pass.
- [x] 3.3 Manually exercise the Edit surface acceptance path: expand the terminal footer, collapse it, maximize and collapse it, reload, and verify the final persisted state is restored; verify Agents mode still hides the utility panel.

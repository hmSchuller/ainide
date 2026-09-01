## 1. Manual Entry Layout

- [x] 1.1 Reorder the workspace picker markup so the manual path field and its related feedback appear before the current-directory browser, while preserving the existing path value and event handlers; verify rendered picker markup places the path field before `Current directory`.
- [x] 1.2 Place the `Open project` action directly after the manual-entry block and before the browse controls; verify the rendered control order remains correct with and without path suggestions.
- [x] 1.3 Keep the suggestion list associated with the path field and in normal layout flow rather than covering adjacent controls; verify a visible listbox does not obscure the open action or the browser.

## 2. Browser Surface And Responsive Layout

- [x] 2.1 Move the current-path display, Home and Parent controls, and immediate child-directory list below the manual-entry block without changing their navigation behavior; verify browse controls still navigate one level and preserve the selected path.
- [x] 2.2 Update picker spacing and mobile styles for the new vertical order; verify the manual action remains reachable above the browser and the browser controls remain usable at the mobile breakpoint.

## 3. Verification

- [x] 3.1 Extend workspace picker rendering tests to cover manual-entry-first ordering, open-action placement, and suggestion placement while retaining existing recent-project and home-start assertions; verify `npm run test -w @ainide/web -- --run src/components/WorkspacePicker.test.tsx` passes.
- [x] 3.2 Run the web typecheck and production build to verify the presentation-only change introduces no TypeScript or bundling regressions: `npm run typecheck -w @ainide/web` and `npm run build -w @ainide/web`.

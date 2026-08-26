## 1. Explorer load scheduling

- [x] 1.1 Add a `useEffect` in `Explorer.tsx` that loads every expanded path missing from `directories` (read latest state via `useAppStore.getState()`), keyed on `expanded`, `workspace?.rootPath`, and `token`; verify expanding a nested folder on a fresh workspace shows entries instead of a permanent "Loading..." message.
- [x] 1.2 Update the directory click handler to detect `opening` before `toggleDirectory` and call `load` when opening a path that is not already cached; verify first-click expand of `apps/web` (or similar) lists children without a second click.

## 2. Refresh coverage

- [x] 2.1 Extend `refresh()` in `App.tsx` to reload the union of cached `directories` keys and currently expanded paths; verify the explorer refresh control reloads an expanded nested folder that was stuck before the fix.

## 3. Verification

- [x] 3.1 Manually verify session restore: expand nested folders, reload the browser, confirm restored expanded paths populate automatically.
- [x] 3.2 Run `npm run typecheck` and `npm test` from the repository root and confirm they pass.

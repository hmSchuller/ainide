## 1. Collapsible recent sessions

- [x] 1.1 Add per-provider collapsed disclosure (zero preview rows, `Recent sessions (N)` toggle with count and `aria-expanded`, independent per provider, collapsed by default, reset on close; no toggle for loading/empty/unavailable) and verify a component test renders the collapsed toggle with count and no recent rows by default
- [x] 1.2 Implement expand/collapse rendering of the ordered recent list with existing resume selection preserved and verify component tests cover expanding one provider while another stays collapsed, re-collapsing, and unchanged loading/empty/unavailable states

## 2. Dialog containment

- [x] 2.1 Bound the picker dialog to the viewport with the provider list as the single inner scroll region (header and Cancel outside the scroll area) and verify by opening the picker with full recent lists at desktop and small-viewport sizes that the dialog stays in-viewport with Cancel reachable
- [x] 2.2 Check `ProjectAgentSettingsDialog` for shared-class regressions from the containment styles and verify the settings dialog still renders without compression or lost actions

## 3. Tests and verification

- [x] 3.1 Update and extend `AcpProviderPicker` tests for every new spec scenario (collapsed default, expand, independence, reopen reset, containment-safe collapsed reachability) and verify `npm run test -w @ainide/web -- --run src/components/AcpProviderPicker.test.tsx` passes
- [x] 3.2 Run web typecheck, lint, and related test suites and verify `npm run typecheck`, `npm run lint`, and the web test suite pass without regressions
- [x] 3.3 Perform a manual end-to-end check with two providers returning full recent lists (collapsed default, Start-new reachable, expand/resume works, small-height viewport keeps header and Cancel visible) and verify each behavior is observed in the running app

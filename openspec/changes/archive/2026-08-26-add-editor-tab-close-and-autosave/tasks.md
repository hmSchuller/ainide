## 1. Auto-save helper

- [x] 1.1 Add `createAutoSaver` with debounced `schedule`, immediate `flush`, and `cancel` per path; verify `apps/web/src/auto-save.test.ts` passes with fake timers.

## 2. Auto-save wiring

- [x] 2.1 Wire Monaco content changes through `handleContentChange` to update the buffer and schedule auto-save; verify editing a file writes to disk after the debounce interval in the running app.
- [x] 2.2 Implement silent auto-save via `writeFile`, updating `savedContent` and clearing `conflict` on success; verify manual ⌘S still shows a success notice and auto-save does not.
- [x] 2.3 Flush pending auto-save before tab close and prompt only if the buffer remains dirty after flush; verify closing a tab immediately after typing saves without a discard prompt when write succeeds.

## 3. Shift-click tab close

- [x] 3.1 Handle Shift-click on editor tab labels to run the shared close flow in both panes; verify Shift-click closes active and inactive tabs and explorer Shift-click still opens the secondary pane.
- [x] 3.2 Cancel pending auto-save timers after a confirmed discard close; verify no save runs after the tab is removed.

## 4. Verification

- [x] 4.1 Run `npm run typecheck` and `npm test` from the repository root and confirm all packages pass.
- [x] 4.2 Manually verify shift-click close, debounced auto-save, flush-on-close, conflict overwrite on auto-save, and unchanged terminal/explorer Shift-click behavior.

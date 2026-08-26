## 1. Pane State

- [x] 1.1 Add primary/secondary pane state, ordered tab paths, active paths, focus state, and split lifecycle types with a primary-only initial state; verify `npm run typecheck -w @ainide/web` passes.
- [x] 1.2 Implement pane actions for opening, activating, closing, reordering, and moving paths while enforcing at-most-one-pane ownership and preserving shared document records; verify same-pane reorder, cross-pane move, empty-secondary, and close-split behavior through focused store/helper tests or deterministic state checks.

## 2. File and Command Routing

- [x] 2.1 Update explorer file opening to distinguish normal clicks from Shift-clicks, create the secondary pane on demand, and focus an existing owner instead of duplicating a path; verify normal and Shift-click scenarios in the running web app.
- [x] 2.2 Route keyboard save, toolbar save, terminal file references, pending line locations, and external file updates through pane-aware state without changing dirty-buffer or conflict behavior; verify saves and line navigation target the focused pane and dirty buffers survive a move.

## 3. Editor Surface

- [x] 3.1 Refactor the single editor surface into a layout plus pane components with independent tab strips, active tabs, empty states, conflict controls, and an explicit close-split action that preserves secondary tabs; verify one-pane startup, two-pane rendering, and mode switching behavior.
- [x] 3.2 Make Monaco instances, editor refs, focus handling, find/go-to-line actions, and path identity pane-aware while retaining shared file content; verify editing either pane updates only its owned document and switching tabs does not lose the document buffer.
- [x] 3.3 Add tab-header drag/drop for same-pane reordering and cross-pane moves, including destination insertion feedback and active-tab updates; verify tabs can move in both directions, cannot be duplicated, and retain dirty/conflict state.

## 4. Layout and Responsive UI

- [x] 4.1 Add equal-width vertical pane layout, pane drop targets, split/close controls, and visual focus/drop states while preserving the existing terminal layout; verify the terminal remains below the editor panes and editor controls remain usable.
- [x] 4.2 Add narrow-viewport scrolling or pane navigation so both panes and their tab controls remain accessible without unreadable compression; verify the two-pane layout manually at desktop and mobile viewport widths.

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm run build` from the repository root and resolve any web integration errors.
- [x] 5.2 Exercise the acceptance matrix for normal click, Shift-click, duplicate prevention, tab reorder, cross-pane drag, dirty/conflicted moves, focused save, review-mode round trip, empty secondary pane, close-split, and narrow-screen access; record the result before completing the change.

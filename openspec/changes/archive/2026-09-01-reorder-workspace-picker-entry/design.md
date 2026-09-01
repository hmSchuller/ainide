## Context

See `proposal.md` for the motivation. The existing workspace picker already supports manual
tilde-aware and absolute path entry, server-backed immediate-child suggestions, keyboard
completion, explicit project opening, and click-based directory navigation. Its current markup
places the browse navigation and folder list before the path field and open action.

The change is limited to the web presentation. The directory-children API, path normalization,
request-generation protection, recent-project behavior, and project-open boundary remain the
existing sources of behavior.

## Goals / Non-Goals

**Goals:**

- Make manual path entry the first workspace-selection surface after any recent-project
  shortcuts.
- Keep the path suggestions visually and semantically attached to the text field.
- Place the project-open action after the complete manual-entry block and before directory
  browsing.
- Keep the browse surface available below the manual controls on desktop and mobile.
- Preserve the existing handlers, path semantics, keyboard interactions, and accessibility
  roles.

**Non-Goals:**

- Changing directory discovery, suggestion matching, or server validation.
- Adding a new endpoint, shared type, cache, or filesystem behavior.
- Changing recent-project ordering or the picker reset-to-home behavior.
- Making the browse surface expandable, searchable, or recursive.

## Decisions

### 1. Reorder the picker at the component boundary

Keep optional recent-project shortcuts at the top as direct-open shortcuts. Render the manual
entry block next, followed by the existing `Open project` action, then render the current-path
header and child-directory browser. Reuse the current state and event handlers rather than
creating a second path-selection flow.

Moving the existing controls is preferred over duplicating them because there must remain one
source of truth for the typed path, current browse location, suggestions, and open callback.
Leaving the button at the bottom was considered but rejected because it keeps the click picker
as the visual path to the primary action.

### 2. Keep suggestions in the manual-entry block's layout flow

Treat the input, its listbox, related feedback, and the open action as one manual-entry block.
The suggestion list must appear after the input and before the button when populated. Adjust the
presentation structure or styles so the list does not cover the button or the browser below it.

An absolutely positioned list that overlays the newly adjacent button was considered but
rejected: it makes the primary action ambiguous and is especially fragile on narrow screens.

### 3. Preserve browse and submit semantics

The open action continues to submit the path value currently in the text field. Folder clicks,
Home, Parent, suggestion selection, Arrow-key movement, Tab completion, and Enter retain their
existing meanings. The browse section is moved visually, not converted into a different mode or
made dependent on manual-entry focus.

### 4. Verify order and responsive structure through web tests

Update picker rendering coverage to assert the manual path label/input and open action occur
before the current-directory and child-directory sections. Retain existing path/API tests and
add focused assertions for suggestion placement if the rendering test setup permits it. Verify
the mobile layout keeps the same vertical order and leaves both control groups reachable.

## Risks / Trade-offs

- [Risk] The card becomes taller when suggestions are rendered in normal flow. -> [Mitigation]
  Keep the existing card and browser scroll constraints, and make only the suggestion list
  consume additional flow space while it is visible.
- [Risk] Users accustomed to browsing first may overlook the moved browser. -> [Mitigation]
  Retain the clear current-directory label and folder list below the primary manual controls.
- [Risk] Moving shared feedback markup could associate a browse error with the wrong section. ->
  [Mitigation] Keep manual-entry validation/suggestion feedback with the manual block and
  browse-loading/errors with the browse section where practical, without changing messages or
  recovery behavior.
- [Risk] A narrow layout could make the primary action or browser controls inaccessible. ->
  [Mitigation] Preserve the card's responsive width and scrolling behavior, and test the
  resulting DOM order at the mobile breakpoint.

## Migration Plan

No data or protocol migration is required. Ship the web markup/style/test update alongside the
existing picker. Rollback consists of restoring the previous picker order and associated styles;
server routes, shared types, browser recents, and persisted project state are unaffected.

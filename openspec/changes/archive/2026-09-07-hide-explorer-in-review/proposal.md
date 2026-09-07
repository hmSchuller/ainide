## Why

Review mode already provides its own changed-file navigation through Difit, while ainide continues to reserve space for the workspace explorer and splitter. Hiding the redundant explorer in Review will give the review surface the full available width and make the mode feel intentionally dedicated to change inspection.

## What Changes

- Hide ainide's workspace explorer and its resize splitter while Review mode is active.
- Allow the Review surface to expand across the full workbench width.
- Preserve explorer state, including its width, expanded directories, cached listings, and selected path, so returning to Edit restores the prior browsing context.
- Ensure the mobile explorer drawer cannot remain over the Review surface after switching modes.
- Leave project switching, Review lifecycle, Difit rendering, and utility terminal behavior unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-mode`: Review mode hides ainide's redundant workspace explorer chrome and uses the available workbench width for the review surface.

## Impact

- `apps/web/src/App.tsx`: make the workbench chrome mode-aware and close or suppress mobile explorer presentation when entering Review.
- `apps/web/src/styles.css`: remove explorer and splitter layout occupancy in Review mode while preserving the main-column layout.
- `apps/web/src/components/Explorer.tsx`: no functional file-operation behavior changes are expected.
- Review and editor state remain browser-local and project-scoped; no server API, shared protocol, persistence, Git, or Difit lifecycle changes are required.

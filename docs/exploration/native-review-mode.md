# Native Review Mode Exploration

> Exploration notes; not an implementation plan or OpenSpec proposal.

## Context

Ainide's current Review mode starts a local Difit process and embeds its URL in an iframe. Difit provides a strong diff viewer, but Review is largely a separate application from Ainide: it owns its own rendering, comments, refresh state, keyboard behavior, and browser storage.

Relevant current code:

- `apps/web/src/components/ReviewSurface.tsx`
- `apps/server/src/review.ts`
- `apps/server/src/git.ts`
- `apps/web/src/components/Editor.tsx`
- `packages/shared/src/index.ts`

## Native Review spectrum

### Native UI over Difit APIs

Ainide would render the Review UI while using Difit's local HTTP API for diff data, blobs, revisions, comments, and file watching. This removes the iframe quickly but retains coupling to Difit's undocumented API and requires an authenticated Ainide proxy.

### Fully Ainide-owned review backend

Ainide would own both the scoped Git review API and the UI. This is the cleaner long-term design:

```text
ReviewSurface
  ├─ ReviewToolbar
  ├─ ChangedFileNavigator
  └─ NativeDiffViewer
         ▲
         │
Ainide /api/git/review
  ├─ scoped manifest
  └─ lazy file contents
         ▲
         │
      Git CLI
```

## Recommended data boundary

Conceptual fixed-scope endpoints:

```text
GET /api/git/review?scope=working-tree
GET /api/git/review/file?scope=working-tree&path=src/app.ts
```

The browser should select from fixed scopes rather than submit arbitrary Git revisions or commands.

The manifest needs:

- active scope
- old/new revision labels and identities
- changed-file list
- additions/deletions
- modified, added, deleted, renamed, binary, and mode-only state
- scope-accurate summary counts
- a scope-specific freshness fingerprint

The file endpoint should lazily return old/new content, labels, rename metadata, and binary/unavailable state.

Scope mappings:

| Scope | Old side | New side |
| --- | --- | --- |
| Working tree | `HEAD` | filesystem |
| Staged | `HEAD` | Git index |
| Last commit | `HEAD~1` | `HEAD` |
| Branch vs main | `main` | `HEAD` |

## Important findings in the existing Difit integration

### Branch comparison ordering

`apps/server/src/review.ts` currently sends `main HEAD` for branch-vs-main. Difit's CLI treats the first positional as the target and the second as the comparison base, resulting in the effective comparison being `HEAD` to `main` rather than `main` to `HEAD`. A native implementation is an opportunity to make old/new semantics explicit.

### Review mutates the index for untracked files

Difit 5.0.2 uses `git add --intent-to-add` when `--include-untracked` is enabled. That changes the index as a side effect of opening a review. A native review should discover untracked files without mutating repository state.

### Current outer summary is not scope-aware

Ainide's header uses the normal working-tree Git summary even when Difit is displaying staged, last-commit, or branch-vs-main changes. A native manifest would make the displayed summary authoritative for the selected scope.

### Scope selection can display stale content

Changing the Review scope currently updates browser state but does not automatically replace the running Difit process or iframe. Native Review should distinguish selected scope from active scope and never show a diff from one scope while labeling it as another.

## UI concept

```text
┌────────────────────────────────────────────────────────────┐
│ Review · Working tree   12 files   +240 −81   [Refresh]     │
│ HEAD → Working tree       [Split] [Unified] [Comments]      │
├──────────────────┬─────────────────────────────────────────┤
│ Changed files    │ src/server/review.ts                    │
│                  │ HEAD              Working tree           │
│ ● review.ts      │ ───── diff content ───────────────       │
│ ● App.tsx        │                                          │
│ ○ README.md      │     [+] Add comment                     │
│ ✕ deleted.ts     │     Comment thread                      │
│                  │                                          │
│ Search files     │                                          │
├──────────────────┴─────────────────────────────────────────┤
│ Review uses saved workspace contents · changes detected      │
└────────────────────────────────────────────────────────────┘
```

The first native renderer should probably show one selected file at a time through a generalized version of the existing Monaco `DiffEditor`. Mounting a Monaco editor for every changed file would create unnecessary memory and lifecycle pressure.

Reusable pieces already exist:

- Monaco `DiffEditor` in `apps/web/src/components/Editor.tsx`
- language selection in `apps/web/src/file-language.ts`
- existing Git diff styling in `apps/web/src/styles.css`
- path-safe authenticated Git routes
- Git polling and stale-request protection
- rename, deletion, binary, conflict, and untracked metadata handling in `apps/server/src/git.ts`

## Hard semantic decisions

### Unsaved buffers

Repository review should likely use saved workspace contents, while Edit's per-file comparison may continue to use the visible unsaved buffer. The Review UI must disclose this instead of silently mixing the two meanings.

### Freshness

Git status counts are not a sufficient revision identity. A file can remain modified while its content changes, and `main` can move while `HEAD` remains unchanged. Review needs a scope-specific fingerprint and should show a reload prompt rather than silently replacing the diff while the user is reading or commenting.

### Exceptional files

The native surface needs explicit states for:

- binary files
- deleted files
- untracked files
- renamed files
- conflicted files
- mode-only changes
- repositories without a valid `HEAD`

### Comments and agent feedback

A native comment model would need file, old/new side, line or range, code snapshot, and thread messages. Browser-local persistence could initially be keyed by project plus review fingerprint.

The Ainide-specific workflow could be:

```text
Inline comments
      ↓
Create feedback prompt
      ↓
Populate ACP draft
      ↓
User explicitly sends it
```

This preserves the existing explicit-send boundary and does not require reintroducing the superseded delegation model.

## Implementation shape to consider later

1. Define the native review parity target.
2. Add fixed-scope review manifest and lazy file-content APIs.
3. Build the changed-file navigator and selected-file Monaco diff.
4. Add scope-accurate summaries and freshness/reload handling.
5. Connect Review and Edit navigation, including agent-reported paths.
6. Add comments and ACP feedback handoff.
7. Add unified view, hunk expansion, reviewed-file state, and responsive polish.

## Main risks

- Correct staged/index semantics are more difficult than working-tree comparison.
- Large files and repositories require lazy loading and bounded rendering.
- Renames, unusual paths, binary files, and conflicts require robust Git parsing.
- Replacing Difit means deciding which features are mandatory: comments, hunk expansion, generated-file detection, viewed-file tracking, and revision selection.
- Monaco model identities and disposal need to be revision- and path-aware.
- Review data should remain transient and should not be added to persisted session snapshots without a deliberate privacy decision.

## Open product question

Should native Review initially target:

1. a solid inspection surface with file navigation, accurate scopes, Monaco diffs, refresh, and Edit handoff; or
2. Difit-level review parity immediately, including inline comments, threads, viewed files, hunk expansion, and agent feedback?

The first option is a manageable vertical slice. The second makes Review a full agent feedback loop but substantially expands the scope.

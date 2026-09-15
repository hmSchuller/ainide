## Context

See `proposal.md` for motivation. The reference kit today captures `ReferenceItem` objects with path, scope, and code content only (`apps/web/src/references.ts`). Add-to-kit actions in `App.tsx`, `Editor.tsx`, and explorer handlers insert items immediately. Serialization uses a `--- path (scope) ---` header plus a fenced block. Difit in Review mode supports inline comments on diffs but cannot annotate arbitrary unchanged code on the Edit surface.

## Goals / Non-Goals

**Goals:**

- Interrupt every add-to-kit path with an optional-comment dialog before insertion.
- Store `comment?: string` on reference items in the browser-local project UI bag.
- Show and edit comments in the Reference Dock without re-capturing code.
- Serialize handoffs as provenance line + optional comment + fenced snippet for PTY and ACP.
- Preserve existing instant copy-as-reference behavior and unchanged `@` file mention flow.

**Non-Goals:**

- Comments in Difit Review mode or cross-import from the Difit iframe.
- Comment dialog on copy-as-reference or ACP `@` file selection.
- Persisting comments or kits to the disk-backed session snapshot.
- Server-side storage or new HTTP endpoints.
- Mandatory comments or comment threads/replies.

## Decisions

### 1. Single shared annotation dialog component

Introduce a small modal or anchored popover used by all add-to-kit entry points: editor selection, editor whole file, and explorer whole file. The dialog receives a pending `ReferenceItem` (or capture inputs) and returns `{ comment?: string } | null` on confirm/cancel.

**Rationale:** One component keeps copy behavior, validation, and keyboard handling consistent.

**Alternative considered:** Inline dock-only annotation — rejected because the user chose an interrupt-at-capture flow similar to Difit.

### 2. Extend `ReferenceItem` with optional `comment`

Add `comment?: string` to the client-side type. Trim whitespace on save; treat empty string as no comment.

**Rationale:** Minimal model change; comments are metadata on a frozen code snapshot.

### 3. Hybrid serialization format

Update `serializeReference` to emit:

```text
src/app.ts:L42-L48
Fix the null check

```typescript
<captured content>
```
```

Whole-file items use the path line without a line suffix. When `comment` is absent, omit the comment block and keep provenance + fence only.

**Rationale:** Aligns provenance with Difit's `path:Lx-Ly` convention while retaining ainide's self-contained snippets. PTY handoff continues to use plain text; no protocol change required for PTY.

**Alternative considered:** Difit-only format without fenced code — rejected; user wants the full marked snippet included.

### 4. ACP context carries comments structurally

Add optional `comment?: string` to `AcpPromptContext` in `packages/shared`. Map from `ReferenceItem` in `promptContextFromReferences`. The ACP composer attachment row shows the comment when present.

**Rationale:** Multi-reference prompts stay structured; comments do not need to be woven into free-form draft text.

**Alternative considered:** Embed comments only in serialized PTY text — insufficient for ACP draft attachments.

### 5. Copy-as-reference bypasses the dialog

`Copy as reference` and `Copy file as reference` keep the current one-step clipboard write with no comment field.

**Rationale:** Clipboard copy is a fast export path; annotation is for kit building and agent handoff where intent matters.

### 6. Dock inline edit for comments

Each `ReferenceDock` item renders an editable textarea (or click-to-edit) bound to `updateReferenceComment(id, comment)` in the store. Editing comment does not touch `content`, `startLine`, or `endLine`.

**Rationale:** Matches Difit's post-capture edit affordance and supports refining intent before handoff.

## Risks / Trade-offs

- **[Extra step on every add-to-kit]** → Mitigation: dialog is lightweight; empty comment + confirm is two clicks; cancel is explicit.
- **[Comment/code mismatch after long editing sessions]** → Mitigation: captured snippet stays frozen; comment edit does not imply freshness; existing stale-snapshot semantics still apply to code.
- **[Serialization format change for PTY agents]** → Mitigation: format is additive (provenance line + optional comment); agents still receive full snippets; document in tests.
- **[Modal focus/keyboard in Monaco]** → Mitigation: trap focus in dialog; Escape cancels; primary action confirms.

## Migration Plan

Browser-only change deployed with the web client. No server migration. Existing kits in memory before reload lack comments and continue to work. Rollback removes the dialog and `comment` field; items without comments serialize as today minus the header tweak if reverted.

## Open Questions

_None._

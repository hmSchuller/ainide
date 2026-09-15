## 1. Data model and serialization

- [x] 1.1 Add optional `comment` to `ReferenceItem` and `updateReferenceComment` in the store; verify `project-ui` bag copy and snapshot exclusion tests still pass
- [x] 1.2 Add optional `comment` to `AcpPromptContext` in `packages/shared` and map it in `promptContextFromReferences`; verify shared typecheck passes
- [x] 1.3 Update `serializeReference` / `serializeReferenceKit` for provenance line, optional comment, and fenced snippet; extend `references.test.ts` for selection, whole-file, empty-comment, and multi-item kit cases

## 2. Annotation dialog

- [x] 2.1 Create a shared `ReferenceAnnotationDialog` showing path/scope, optional comment field, Cancel, and Add to kit; verify cancel returns null and confirm returns trimmed comment or undefined
- [x] 2.2 Wire editor add-selection and add-file-to-kit actions through the dialog before `addReference`; verify cancel does not add and confirm with empty comment adds an uncommented item
- [x] 2.3 Wire explorer Add to reference kit through the same dialog; verify whole-file items can be added with a comment

## 3. Reference Dock and ACP UI

- [x] 3.1 Show editable comment field per item in `ReferenceDock` and persist edits via `updateReferenceComment` without changing captured content; verify handoff uses the updated comment
- [x] 3.2 Show optional comment on ACP draft attachment rows in `AgentWorkbench`; verify commented kit paste into an ACP draft displays comments on attachments

## 4. Verification

- [x] 4.1 Keep copy-as-reference actions immediate with no dialog; verify `references.test.ts` or a focused UI test still covers clipboard serialization without comments
- [x] 4.2 Run `npm run typecheck` and `npm test` for `apps/web` and `packages/shared`; verify all tests pass

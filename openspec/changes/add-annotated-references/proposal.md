## Why

The reference kit captures code snippets with path and line provenance, but gives users no way to attach intent — what they want the agent to notice or do. Difit solves this for changed code in Review mode, but ainide's Edit surface lets users read and mark **any** code, including unchanged context that never appears in a diff. Annotated references close that gap with a Difit-like capture flow while keeping the full snippet in the handoff.

## What Changes

- Every add-to-kit action (editor selection, whole file from editor, explorer file) opens an interrupt dialog where the user may optionally enter a comment before confirming.
- Reference items gain an optional `comment` field stored in the browser-local kit and ACP draft attachments.
- The Reference Dock displays each item's comment and lets the user edit it after capture without re-reading the file.
- Serialized references and ACP context include provenance, the optional comment, and the fenced code snippet (selection or whole file).
- Copy-as-reference actions keep the current instant clipboard behavior without the interrupt dialog.
- `@` file mentions in the ACP composer remain unchanged (no comment dialog on `@` selection).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `agent-reference-handoff`: Add optional per-reference comments at capture time, editable in the dock, included in agent-ready serialization and ACP handoff for both line selections and whole files.

## Impact

- `apps/web/src/references.ts` — `ReferenceItem`, serialization, ACP context mapping
- `apps/web/src/components/ReferenceDock.tsx` — comment display and inline edit
- `apps/web/src/App.tsx` and `apps/web/src/components/Editor.tsx` — capture dialog on add-to-kit paths
- `apps/web/src/explorer-actions.ts` — explorer add-to-kit uses the same dialog
- `apps/web/src/components/AgentWorkbench.tsx` — ACP draft attachment display for comments
- `packages/shared/src/index.ts` — optional `comment` on `AcpPromptContext` (if structured handoff is used)
- `openspec/specs/agent-reference-handoff/spec.md` — requirement updates via delta
- Tests in `apps/web/src/references.test.ts` and related UI tests

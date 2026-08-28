## Why

The Edit tab runs Monaco's bundled TypeScript language service with no workspace `tsconfig`, `node_modules`, or sibling files. Working TypeScript (for example NestJS `import { Injectable } from '@nestjs/common'`) is marked as broken, and completions, hover, and Quick Fix invent the same empty-sandbox project. ainide is a cockpit, not a second IDE; those markers are noise, not truth.

## What Changes

- Treat Monaco as a highlighted editing surface for TypeScript and JavaScript: keep syntax coloring, editing, Find, Go to line, view state, and the existing context-menu actions.
- Disable the in-browser TypeScript/JavaScript language-service costume: semantic diagnostics, suggest-as-you-type from the worker, hover types, signature help, lightbulb/code actions, go-to-definition, rename, and inlay hints.
- Keep syntax-only validation (unmatched braces, broken strings) so real parse errors still show.
- Leave JSON and CSS workers unchanged. Do not add a real language server, extraLibs, or tsconfig loading in this change.

## Capabilities

### New Capabilities

- `editor-language-surface`: Edit-mode Monaco is a highlighted buffer with syntax-only checking for TypeScript and JavaScript, not an in-browser language service.

### Modified Capabilities

- None. Existing editor specs cover auto-save, split panes, and reference actions; they do not describe language-service behavior.

## Impact

- `apps/web/src/components/Editor.tsx` (and a small helper if the configuration is extracted): Monaco TypeScript/JavaScript defaults configured once when the editor loads.
- No server, protocol, or shared-type changes.
- No new dependencies. No settings UI.
- Reference-kit context menu, auto-save, split panes, and other languages' highlighting stay as they are.

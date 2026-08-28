## Context

See `proposal.md` for motivation. `Editor.tsx` mounts `@monaco-editor/react` with `language` from the file extension (`typescript` for `.ts`/`.tsx`, `javascript` for `.js`/`.jsx`) and never configures Monaco's TypeScript defaults. Monaco then starts its bundled worker with semantic validation on for TypeScript. JavaScript already has semantic validation off; TypeScript does not. Completions, hover, definition, signature help, code actions, and inlay hints stay enabled for both. There is no workspace `tsconfig`, `node_modules`, or extraLibs.

JSON and CSS use separate Monaco workers and are out of scope.

## Goals / Non-Goals

**Goals:**

- Configure Monaco once so TypeScript and JavaScript expose highlighting plus syntax-only diagnostics.
- Disable the rest of the in-browser TypeScript language-service feature set so the UI does not look like IntelliSense.
- Keep Nest/React syntax (decorators, JSX) from being flagged just because compiler options are empty.

**Non-Goals:**

- Real LSP / tsserver on the ainide server.
- Loading `tsconfig` or `node_modules` into `extraLibs`.
- Changing JSON, CSS, HTML, or highlighter-only languages.
- A setting to turn the language service back on.
- Replacing Monaco.

## Decisions

### Mute the feature set, not only the gutter

On both `typescriptDefaults` and `javascriptDefaults`:

- Diagnostics: `noSemanticValidation: true`, `noSyntaxValidation: false`, `noSuggestionDiagnostics: true`.
- Mode configuration: turn off `completionItems`, `hovers`, `definitions`, `references`, `rename`, `signatureHelp`, `codeActions`, and `inlayHints`. Leave `diagnostics` on so syntax markers still appear. Leave document symbols, highlights, and formatting as Monaco defaults unless they pull the worker into the UI.

**Alternative considered:** Diagnostics-only mute. Rejected: completions, hover, and the lightbulb would still describe the empty sandbox.

**Alternative considered:** `diagnostics: false` as well. Rejected: unmatched braces and broken strings are honest and useful.

### Permissive compiler options for syntax checking

Set TypeScript compiler options to a permissive highlight/parse profile: latest target, JSX preserve, `experimentalDecorators`, `allowNonTsExtensions` (already default). This is not project fidelity; it stops the syntax checker from treating common TypeScript as invalid when no tsconfig is loaded.

**Alternative considered:** Leave default compiler options. Rejected: decorator and JSX files can still light up even with semantic validation off.

### Configure once at Monaco load

Extract `configureMonacoLanguageSurface(monaco)` and pass it as `@monaco-editor/react` `beforeMount` (or equivalent). Guard with a module-level flag so primary and secondary panes do not fight. Apply to both TypeScript and JavaScript defaults so `.js`/`.jsx` match `.ts`/`.tsx`.

**Alternative considered:** Configure inside each pane `onMount`. Rejected: two editors, one global language service; easy to duplicate or race.

### Keep language ids as they are

Continue mapping `.ts`/`.tsx` → `typescript` so Monarch highlighting stays. Do not invent a custom language id just to avoid the worker; mute the worker instead.

## Risks / Trade-offs

- **[Syntax checker still nags on exotic TS]** → Mitigation: permissive compiler options; if a real false syntax error remains, we can ignore specific diagnostic codes without re-enabling semantics.
- **[Word-based suggest still appears]** → Mitigation: acceptable; it is not the TypeScript language service. Do not confuse it with type-aware complete.
- **[JSON/CSS false positives remain]** → Mitigation: out of scope; revisit only if they become noisy.
- **[Users expect go-to-definition in Edit]** → Mitigation: product stance is cockpit buffer; real IDE remains Cursor/VS Code. No settings toggle in this change.

## Migration Plan

Web-only. No data or server migration. Ship in one release; rollback by reverting the web diff.

## Open Questions

None.

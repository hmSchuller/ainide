## 1. Language-surface helper

- [x] 1.1 Add `configureMonacoLanguageSurface(monaco)` that applies syntax-only diagnostics, muted TypeScript/JavaScript language-service features, and permissive compiler options to both `typescriptDefaults` and `javascriptDefaults`; verify `apps/web/src/monaco-language-surface.test.ts` asserts those options on a fake Monaco defaults object.
- [x] 1.2 Guard the helper so a second call is a no-op; verify the test covers primary-then-secondary pane configuration without applying defaults twice.

## 2. Editor wiring

- [x] 2.1 Pass the helper as `@monaco-editor/react` `beforeMount` from `Editor.tsx` (both panes share the same loader); verify TypeScript and JavaScript tabs still use the existing language ids and that Find, Go to line, and reference-kit context menu actions still register.
- [x] 2.2 Leave JSON, CSS, SCSS, HTML, and highlighter-only language mapping unchanged; verify no JSON/CSS diagnostics options are written by the helper.

## 3. Verification

- [x] 3.1 Run `npm run typecheck` and `npm test` from the repository root and resolve failures introduced by this change.
- [x] 3.2 In the running app, open a TypeScript file that imports a package (for example `@nestjs/common`): confirm highlighting, no cannot-find-module squiggle, no type hover, no language-service completions or lightbulb, and that an unmatched `{` still shows a syntax error; repeat in the secondary pane and with a `.tsx` decorator/JSX file.

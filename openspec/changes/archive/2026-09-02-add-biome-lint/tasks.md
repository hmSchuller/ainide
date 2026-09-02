## 1. Tooling setup

- [x] 1.1 Add `@biomejs/biome` (pinned version) as a root `devDependency` and verify `npm install` succeeds and `npx @biomejs/biome --version` prints a version.
- [x] 1.2 Add root `biome.json` — linter enabled from the `recommended` set plus the React and a11y groups with `useExhaustiveDependencies` and `noConsole` active, `organizeImports` enabled, and `formatter` disabled — then verify `npx @biomejs/biome check .` runs to completion (no crash) and reports findings.
- [x] 1.3 Add a root `lint` npm script (`biome check .`) and verify `npm run lint` executes it.

## 2. tsconfig unused-variable flags (fold-in)

- [x] 2.1 Add `noUnusedLocals` and `noUnusedParameters` to `tsconfig.base.json` and verify `npm run typecheck` passes, fixing any newly-flagged unused variables/parameters.
- [x] 2.2 Configure `biome.json` so its unused-variable rule is not active (let `tsc` be the single source of truth) and verify `npm run lint` does not emit duplicate unused-variable reports.

## 3. Triage findings

- [x] 3.1 Run `npm run lint`, review every finding, and fix the real issues (avoid blanket suppression; use a targeted, commented ignore only where a rule is genuinely wrong for this codebase) — verify `npm run lint` reports zero errors.
- [x] 3.2 Apply safe import-organization fixes (`npx @biomejs/biome check --apply-safe .`) and verify import blocks are reordered/grouped while `npm run typecheck` still passes.

## 4. Docs + verification

- [x] 4.1 Add `npm run lint` to the Commands section of `AGENTS.md` and verify the documented command matches the `package.json` script.
- [x] 4.2 Run `npm run typecheck` and `npm test` and verify both pass (confirms no behavior change).
- [x] 4.3 Inspect `git diff` and verify the change is limited to config files + lint/import fixes, with no reformatting of long body lines.

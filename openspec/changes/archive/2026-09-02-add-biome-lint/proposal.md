## Why

ainide is already unusually clean — `strict: true` everywhere, zero explicit `any`, zero `ts-ignore`, zero `console.log` in source, and 50 co-located test files. But the only automated gate is `tsc`. There is no linter or formatter, and `noUnusedLocals` / `noUnusedParameters` are off, so an entire class of drift — unused variables/imports, React hook dependency bugs (24 `useEffect`s across 9 files), floating promises on a PTY/WebSocket/ACP server, and future `console.log`/bad-import creep — is currently caught only by a human reviewer. Adding Biome locks in the discipline the codebase already practices and makes future mechanical refactors safe.

## What Changes

- Add **Biome** as a root `devDependency` and a root `biome.json` config.
  - **Linter enabled** starting from the `recommended` rule set plus the React and a11y rule groups; confirm `useExhaustiveDependencies` and `noConsole` are active.
  - **Import organization enabled** (sorts/groups import blocks) — useful for the 6-domain server and the large `shared/index.ts`.
  - **Formatter disabled** — a deliberate decision (see design.md). The codebase runs at effectively unlimited line width (1746 lines over 80 chars; longest line is 2326 chars in `AgentWorkbench.tsx`). Enabling the formatter would produce a ~1700-line reflow on first run, which is out of scope for a tooling addition and is better addressed by component/route extraction.
- Add a root `lint` npm script (`biome check .`).
- **Fold in (tool-agnostic):** enable `noUnusedLocals` and `noUnusedParameters` in `tsconfig.base.json` — the missing unused-variable guard, with zero new machinery.
- Triage and fix any findings the linter surfaces (expected to be small given the codebase's current cleanliness).

No runtime behavior, HTTP/WS protocol, or application dependency changes.

## Capabilities

### New Capabilities
None. This is a pure tooling/development-workflow change; it introduces no product behavior.

### Modified Capabilities
None. No behavioral requirement in any existing spec changes. `skip_specs: true` is set accordingly.

## Impact

- **New dependency:** `@biomejs/biome` (root `devDependency` only).
- **New files:** `biome.json` (root).
- **Modified files:** `package.json` (root — `lint` script + devDep), `tsconfig.base.json` (two compiler flags).
- **Possible small code edits:** to satisfy newly-surfaced lint findings (unused vars, hook deps, import order).
- **Out of scope (explicit):** body reformatting / line-width enforcement — deferred to the `App.tsx`/route-plugin refactors where the long JSX lines originate.

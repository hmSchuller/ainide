## Context

ainide is a local-first, three-package npm-workspace monorepo (`shared`, `server`, `web`). Current automated gate is `tsc` only (`strict: true` via `tsconfig.base.json`); there is no linter, no formatter, and no CI. The code is already clean by hand (no `any`, no `console.log`, no `ts-ignore`), but `noUnusedLocals`/`noUnusedParameters` are off and nothing catches React hook dependency bugs (24 `useEffect`s across 9 files) or floating promises on a PTY/WebSocket/ACP server. The code runs at effectively unlimited line width (1746 lines > 80 chars; longest is 2326 chars). See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- A fast, single-tool lint + import-organization guardrail at the repo root.
- Unused-variable/import detection with zero new machinery.
- A small, reviewable, purely-additive diff (no behavior change).
- Enable safe mechanical refactors going forward.

**Non-Goals:**
- Body reformatting / line-width enforcement (deferred to component/route extraction).
- Any runtime, protocol, or application-dependency change.
- Setting up CI (none exists yet).
- The `App.tsx` / `server.ts` route-plugin refactors that actually remove the long JSX lines.

## Decisions

**1. Biome over ESLint+Prettier.**
Single Rust-based tool that does lint + import organization + (optionally) format in one config, instant feedback, and lets us disable the formatter cleanly. At 11k LOC ESLint's edge on `react-hooks`/`typescript-eslint` async rules is not worth two tools, flat-config verbosity, and slower runs for a project of this size.
- *Alternatives considered:* **ESLint + Prettier** — best hooks/async lint, but 2 tools/configs and the code is already Prettier-shaped so the formatter buys little. **tsconfig flags only, no linter** — too little: no hook-dep, no-console, or import-order guard.

**2. Formatter disabled; lint + import-organization only.**
Enabling Biome's formatter (default 80-col) reflows ~1746 lines on first run — a ~1700-line diff that buries real findings and is the wrong fix for a god-component problem (the long lines live in `AgentWorkbench.tsx`/`App.tsx`). Config: `linter.enabled: true`, `organizeImports.enabled: true`, `formatter.enabled: false`. `biome check .` then = lint + import tidy, no body reflow.
- *Alternatives considered:* **full `biome check`** — rejected (noisy reflow). **format at a high `lineWidth`** — still reflows some lines and doesn't match how the code is actually written.

**3. Rule set: `recommended` baseline + React + a11y; keep it conservative.**
Start from Biome's `recommended` and add the React and a11y groups so `useExhaustiveDependencies` and `noConsole` are active. Deliberately conservative so the first run surfaces a small, triageable set rather than a flood. Exact rule IDs/levels are confirmed against the installed Biome version during implementation (deferrable; does not change approach).
- *Alternatives considered:* full `strict`/`all` — too noisy for a first adoption on already-clean code.

**4. `tsc` owns unused-variable detection.**
Enable `noUnusedLocals` + `noUnusedParameters` in `tsconfig.base.json` (tool-agnostic, zero new machinery). To avoid double-reporting, the equivalent Biome unused-var rule is left off — `tsc` is the single source of truth for "unused", Biome handles everything else (hooks, console, import order, a11y).

**5. Standalone `lint` script, not a CI gate.**
Add root `lint` = `biome check .`. No CI exists, so it's run in the dev loop / before changes land. Wiring into CI is a separate future change.

## Risks / Trade-offs

- [Biome's `useExhaustiveDependencies` is less precise than `eslint-plugin-react-hooks`] → Accepted for housekeeping; catches the common missing-dep cases. Revisit only if a hook bug slips through.
- [First-run findings may include stylistic noise] → Conservative rule set; triage each finding, prefer fixing the real issue over suppressing. Use targeted, commented ignores only where a rule is genuinely wrong for this codebase.
- [Import reorganization may touch many files] → Cosmetic and safe; review as one logical change, and it's reversible.
- [Biome version drift introducing new rules on upgrade] → Pin the devDep version; new rules are opt-in via config, not automatic.
- [Unused-var rule overlap (tsc vs Biome)] → Resolved by decision 4 (tsc owns it, Biome's off).

## Migration Plan

1. Add `@biomejs/biome` (pinned) as a root `devDependency`; add root `biome.json` per decisions 2–4.
2. Add `noUnusedLocals` + `noUnusedParameters` to `tsconfig.base.json`.
3. Add root `lint` script (`biome check .`).
4. Run `biome check .`; triage findings; apply safe import-organization fixes (`biome check --apply-safe`).
5. Run `npm run typecheck` and `npm test` to confirm no behavior change.

**Rollback:** purely additive — remove the devDep, `biome.json`, the two tsconfig flags, and the `lint` script. No data or behavior to migrate.

## Open Questions

- Whether to later add a CI workflow that runs `lint` + `typecheck` + `test` as a gate (out of scope here; no CI exists yet).

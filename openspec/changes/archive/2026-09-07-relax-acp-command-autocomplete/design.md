## Context

See `proposal.md` — Why. The ACP composer already detects slash tokens, filters provider `availableCommands`, and renders suggestions through `acp-command-autocomplete.ts` and `AgentWorkbench.tsx`. Filtering today uses case-insensitive `startsWith` on the full command name. The `@` file autocomplete module already implements tiered scoring and deterministic ranking in the same composer.

## Goals / Non-Goals

**Goals:**

- Make namespaced provider commands discoverable from action segments (`/apply` → `opsx-apply`).
- Support partial and typo-tolerant recall within segments (`/plore` → `opsx-explore`, `/opose` → `opsx-propose`).
- Keep stronger matches ranked above weaker ones and preserve existing keyboard, insertion, and client `/new` behavior.

**Non-Goals:**

- Fuzzy edit-distance matching across the full command name.
- Searching command descriptions or input hints.
- Changes to server command normalization, wire protocol, or PTY autocomplete.
- UI highlighting of matched substrings.

## Decisions

### 1. Reuse a tiered score function in the command autocomplete module

Add a `commandMatchScore(name, query)` helper alongside the existing filter functions. Lower scores are better matches:

| Score | Match type | Example |
|------:|------------|---------|
| 0 | Empty query (show all) | `/` |
| 1 | Full name prefix | `/opsx` → `opsx-apply` |
| 2 | Hyphen-segment prefix | `/apply` → `opsx-apply` |
| 3 | Segment substring (query length ≥ 3) | `/plore` → `opsx-explore` |
| 4 | In-order subsequence within a segment (query length ≥ 4) | `/opose` → `opsx-propose` |

Split command names on `-` and evaluate each segment independently; take the best (lowest) score across the full name and all segments. Unmatched commands receive score `-1` and are excluded.

Alternative considered: pure substring on the full name (`includes`). Rejected because short queries like `/re` would match too many unrelated commands.

Alternative considered: Levenshtein distance. Rejected as unnecessary complexity and harder to reason about for v1; subsequence covers the main typo cases discussed.

### 2. Gate noisy tiers by query length

- Length 0: show all commands (unchanged).
- Length 1–2: allow scores 1–2 only (full-name prefix and segment prefix).
- Length 3+: also allow segment substring (score 3).
- Length 4+: also allow in-order subsequence (score 4).

This mirrors the user's desire for typo help without flooding `/o`-style queries.

### 3. Apply the same scoring to client and provider suggestions

`filterAcpSuggestions` already merges `CLIENT_ACP_COMMANDS` with provider commands. Both lists use the same score function and sort order. Client commands remain listed before provider commands only when scores tie at insertion order today — update to sort the combined list purely by score, then kind (client before provider on tie), then name.

Alternative considered: keep client commands always first. Rejected because a strong provider prefix match should not sit below `/new` when the user typed `/rev`.

### 4. Keep token detection and insertion unchanged

`matchAcpCommandToken`, `insertAcpCommand`, keyboard handling in `AgentWorkbench.tsx`, and client-command execution paths stay as-is. Only filtering and ordering change.

### 5. Align tests with spec scenarios

Extend `acp-command-autocomplete.test.ts` with explicit cases for namespaced commands, segment substring, subsequence, minimum-length gates, ranking order, and unchanged insertion behavior. No new component tests unless an integration gap appears.

## Risks / Trade-offs

- **[Risk] Subsequence matches may feel surprising for unrelated commands** → Mitigated by requiring query length ≥ 4 and ranking prefix/segment matches above subsequence.
- **[Risk] Sort order change affects muscle memory for bare `/`** → Bare `/` still shows all commands; only non-empty queries reorder by relevance.
- **[Risk] Provider command named `explore` vs `opsx-explore`** → Segment-prefix and full-name-prefix tiers rank the shorter exact segment match higher when scores tie on tier.

## Migration Plan

Web-only change. Ship with updated unit tests; no server migration or feature flag required. Rollback is reverting the autocomplete module and spec delta.

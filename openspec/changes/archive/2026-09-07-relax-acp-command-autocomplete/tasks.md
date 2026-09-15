## 1. Scored command matching

- [x] 1.1 Add `commandMatchScore(name, query)` with tiered full-name prefix, segment prefix, segment substring (query length ≥ 3), and in-order subsequence (query length ≥ 4) scoring; verify unit tests cover each tier, minimum-length gates, and `-1` for non-matches
- [x] 1.2 Replace prefix-only filtering in `filterAcpSuggestions` and `filterAcpCommands` with score-based filtering and deterministic sort (score, then client-before-provider on tie, then name); verify tests show `/apply` matches `opsx-apply`, `/plore` matches `opsx-explore`, and `/opose` matches `opsx-propose`

## 2. Preserve existing composer behavior

- [x] 2.1 Confirm `matchAcpCommandToken`, `insertAcpCommand`, and `moveAcpCommandIndex` remain unchanged and existing insertion/keyboard tests still pass
- [x] 2.2 Verify bare `/` still lists all commands, short queries (`/re`) stay prefix-only, and client `/new` continues to filter and execute correctly alongside provider commands

## 3. Verification

- [x] 3.1 Run `npm test -- acp-command-autocomplete` and `npm run typecheck` from the repo root; verify all tests pass with no type errors

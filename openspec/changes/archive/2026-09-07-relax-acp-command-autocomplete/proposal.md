## Why

ACP composer slash-command autocomplete only matches command names by strict prefix. Namespaced provider commands such as `opsx-apply` and `opsx-explore` do not appear when the user types `/apply` or `/plore`, which makes discovery awkward and punishes common typos or partial recall of the action segment after a namespace prefix.

## What Changes

- Replace strict prefix-only command filtering with ranked, segment-aware matching that still prefers exact and prefix hits.
- Match command names by full-name prefix, hyphen-segment prefix, segment substring, and (for sufficiently long queries) in-order subsequence within segments.
- Gate noisier match tiers behind minimum query length so very short partial commands stay predictable.
- Rank suggestions by match quality and break ties deterministically, mirroring the existing `@` file autocomplete approach.
- Preserve existing token detection, keyboard handling, client `/new` command behavior, insertion semantics, and submission key precedence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `acp-agent-sessions`: Relax provider slash-command filtering from prefix-only to ranked segment-aware matching with typo-tolerant partials.

## Impact

- `apps/web/src/acp-command-autocomplete.ts`: Replace prefix-only filtering with scored segment-aware matching and deterministic ranking.
- `apps/web/src/acp-command-autocomplete.test.ts`: Cover namespaced commands, partial segments, substring and subsequence matches, minimum query length gates, and ranking order.
- `apps/web/src/components/AgentWorkbench.tsx`: No behavioral change expected unless tests reveal an integration gap.
- No server, shared-type, persistence, or wire-protocol changes.

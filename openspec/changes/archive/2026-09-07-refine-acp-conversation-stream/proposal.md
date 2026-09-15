## Why

The ACP conversation view still reads like a protocol inspector—turn cards, labeled summary sections, and a hidden "Raw activity" drawer—rather than a coherent chat experience comparable to Cursor or OpenCode. Users cannot follow the real sequence of prompts, tool steps, and agent responses, and the default OS scrollbar breaks the otherwise polished cockpit feel.

## What Changes

- Replace the turn-card summary model (`AcpTurnNarrative` with prompt/final-response/current-action sections and a raw-activity disclosure) with a single chronological conversation stream that renders all `AcpActivity` items in arrival order.
- Present user and agent messages as conversational prose (safe Markdown) without uppercase section labels or duplicate rendering of the same message.
- Render tool calls, plans, terminal activity, diffs, locations, and thoughts as compact inline stream items with human-readable titles; expose protocol details (JSON I/O, full diff text) only on explicit expand.
- Remove turn-card chrome (headers, bordered per-item boxes as the default) in favor of spacing and subtle dividers between user-initiated exchanges.
- Introduce a shared cockpit scrollbar style for primary scroll surfaces, starting with the ACP conversation history, so scrolling matches the dark UI instead of the OS default.
- Preserve existing behavior: streaming coalescence, bottom-follow scroll policy, "New activity" affordance, pending permission/auth panels, file/diff inspection navigation, subagent display, and session boundaries.

## Capabilities

### New Capabilities

<!-- No new capabilities. Presentation changes extend existing session and workbench behavior. -->

### Modified Capabilities

- `acp-agent-sessions`: Update conversation rendering requirements to mandate a chronological chat stream with compact secondary activity and no summary/raw split.
- `agent-workbench`: Add a requirement for styled scrollbars on primary workbench scroll surfaces, including the ACP conversation history.

## Impact

- `apps/web`: Replace or refactor `AcpTurnNarrative`, `AcpActivityView`, and related CSS; add a shared scrollbar utility; update component tests.
- `apps/web/src/acp-turns.ts`: Repurpose turn projection for metadata only (active exchange, inspection targets, bounds)—not as the primary render model.
- `packages/shared`, `apps/server`: No protocol or API changes.
- Existing OpenSpec requirements for Markdown safety, scroll-follow, permissions, and inspection return navigation remain in force.

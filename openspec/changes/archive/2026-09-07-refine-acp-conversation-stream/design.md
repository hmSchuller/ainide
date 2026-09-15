## Context

ACP activity already arrives as an ordered, coalesced `AcpActivity[]` in the browser (`acp-state.ts` merges streaming message and tool-call updates in place). The current UI (`AcpTurnNarrative`) projects turns and renders a summary layer—prompt, synthetic current action, final response—while tucking the real sequence into a "Raw activity" disclosure. That model was introduced to improve inspection after removing the delegation workbench, but it produces a protocol-inspector feel rather than a Cursor/OpenCode-style chat stream.

See `proposal.md` for motivation. Existing requirements for Markdown safety, bottom-follow scroll, permissions, file/diff inspection, and subagent display remain unchanged.

## Goals / Non-Goals

**Goals:**

- Render ACP history as one chronological conversation stream with no summary/raw split.
- Make user and agent messages read as conversational prose; show tool and secondary activity as compact inline rows.
- Preserve streaming in place, inspection navigation, and session-local recovery panels.
- Introduce a shared cockpit scrollbar style, applied first to `.acp-history`.
- Repurpose turn projection for metadata only (active exchange, inspection targets, bounds)—not primary rendering.

**Non-Goals:**

- Changing ACP protocol, server transport, or persistence.
- Redesigning PTY terminal presentation.
- Unifying ACP and PTY into one visual component.
- Adding debug/protocol mode toggles beyond expandable tool rows.
- Restyling every scroll surface in the app in the first pass (only primary surfaces called out in specs).

## Decisions

### 1. Replace `AcpTurnNarrative` with a stream renderer

Introduce `AcpConversationStream` (name may vary) that maps `history[]` directly to stream items in arrival order. Remove turn-card chrome, section labels, and the raw-activity `<details>` block.

**Alternative considered:** Strip labels from the existing turn-card layout. Rejected because the summary/raw split and duplicate message rendering are structural, not cosmetic.

### 2. One stream item component per activity type

Refactor `AcpActivityView` into stream-oriented presenters (or a single `AcpStreamItem` dispatcher):

| Activity | Default presentation |
|----------|---------------------|
| `message` user | Conversational block, subtle background, no "Prompt"/"USER" label |
| `message` agent | Markdown prose block |
| `message` thought | Collapsed "Thinking…" details, muted |
| `tool_call` | Compact row: title + status indicator; expand for input/output `<pre>` |
| `plan` | Compact note row or grouped with tools |
| `location` | Inline link button (existing behavior, de-boxed) |
| `diff` | Compact row + "Open in Review"; expand for diff text |
| `terminal` | Compact row; expand for output |
| `usage` | Muted one-line footer |
| `turn` | No visible chrome (or spacing only) |
| `unknown` | Minimal summary; expand for sanitized JSON |

**Alternative considered:** Keep bordered boxes with fewer labels. Rejected—still reads as form sections, not chat.

### 3. Derive turn boundaries for metadata, not rendering

Keep `projectAcpTurns()` for:

- Assigning `turnId` to inspection targets (last user message before each activity)
- Identifying the active exchange for blocking-request context
- Omission messaging ("showing latest N turns")

Do **not** use `finalResponse`, `currentAction`, or turn-card sections in the render path.

### 4. Shared scrollbar utility

Add a `.cockpit-scroll` CSS utility (and optional `.cockpit-scroll-nested` for expand areas):

- WebKit: ~10px gutter, transparent track, rounded pill thumb using palette colors (`#3a4654` rest, `#52606f` hover)
- Firefox: `scrollbar-width: thin` + `scrollbar-color`
- Apply to `.acp-history` immediately; agent navigator and other primary surfaces can adopt in the same change if low-cost

Intentionally forces visible scrollbars in Chromium (vs macOS overlay)—matches Cursor/VS Code behavior.

Adjust `.acp-history` right padding so the styled scrollbar and floating "New activity" button do not overlap.

**Alternative considered:** Conversation-only scrollbar CSS. Rejected per exploration—scrollbar inconsistency elsewhere would remain obvious.

### 5. CSS philosophy shift

Move from nested bordered cards (`.acp-turn-card`, `.acp-message`, `.acp-tool` as full boxes) to:

- Stream typography and vertical rhythm
- Hairline or spacing dividers between user-initiated exchanges
- Tool rows as list items, not cards
- Optional top fade or border on `.acp-history` when `scrollTop > 0` (nice-to-have in first pass)

Remove or deprecate styles tied to the old model (`.acp-turn-section`, `.acp-raw-activity`, turn-card headers).

### 6. Preserve existing integration points

- `AgentWorkbench` keeps the same history container, scroll-follow logic, and "New activity" button
- `onOpenReference` / `onOpenDiff` continue threading `turnId` and `activityId`
- Pending permission, auth, and elicitation panels stay outside the stream
- `SubagentList` stays above the stream

## Risks / Trade-offs

- [Long tool-heavy sessions become visually noisy] → Compact rows + collapsed thoughts/unknowns; completed tool rows stay single-line by default.
- [Removing turn cards reduces explicit turn status visibility] → Active session status remains in the execution header; completed/failed turn markers are implicit in stream order.
- [Legacy/unclassified replay bursts lack a user prompt] → Render chronologically with a subtle "Earlier activity" divider instead of dashed turn cards.
- [Custom scrollbars differ from OS settings] → Intentional product choice; document in design only, not user-facing.
- [Refactor touches many tests] → Update `AcpTurnNarrative` tests to stream tests; keep inspection and scroll-follow tests green.

## Migration Plan

1. Implement stream renderer and stream item styles behind replacement of `AcpTurnNarrative`.
2. Add `.cockpit-scroll` and apply to `.acp-history`.
3. Remove dead turn-card/summary CSS and components.
4. Update component and integration tests; run lint, typecheck, test, build.
5. Rollback: revert web-only change; no server or persistence migration.

## Open Questions

- Whether to apply `.cockpit-scroll` to agent navigator and explorer in the same PR or immediately after (low risk either way).
- Exact user-message alignment (full-width left vs subtle right bias)—default to full-width left with background tint unless user feedback says otherwise during apply.

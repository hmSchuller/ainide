## Why

ACP conversations currently display user and agent message text as unformatted paragraphs, even though agent responses commonly use Markdown for headings, lists, links, emphasis, and code examples. Rendering the conversation as safe Markdown will make both sides of the transcript easier to scan without changing the prompt or response data exchanged with providers.

## What Changes

- Render both ACP user messages and ACP agent messages as Markdown in the conversation history.
- Preserve the original message source text for ACP transport, history, streaming updates, and any future copy or inspection behavior.
- Support common conversational Markdown, including paragraphs, headings, emphasis, lists, blockquotes, links, inline code, fenced code blocks, and tables where supported by the selected parser.
- Render provider and user content without allowing unsafe raw HTML or executable URL schemes.
- Keep thoughts visually distinct while allowing their Markdown content to render consistently with ordinary messages.
- Keep tool input/output, diffs, terminal output, plans, and other structured activities in their existing text or preformatted presentation unless explicitly represented as messages.
- Preserve streamed message coalescing and rerender Markdown safely as message content grows.

## Capabilities

### New Capabilities

<!-- No new capability is introduced; this extends ACP conversation rendering. -->

### Modified Capabilities

- `acp-agent-sessions`: ACP user and agent message history is rendered as safe Markdown while preserving source text and session activity behavior.

## Impact

- `apps/web`: ACP activity rendering and conversation styles need a safe Markdown rendering surface and coverage for both message roles.
- `apps/server/src/acp/normalize.ts` and shared ACP activity metadata may need consistent message-format semantics so streamed and restored activities render predictably.
- Web dependencies may gain a Markdown parser and, if needed, a sanitizer or URL policy helper; no provider-specific API or server endpoint is required.
- Existing ACP transport, session history ordering, project boundaries, PTY terminals, and non-message activity renderers remain unchanged.

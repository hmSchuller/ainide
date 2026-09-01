## 1. Markdown Rendering Foundation

- [x] 1.1 Add the web Markdown renderer and narrowly scoped GFM dependency, and verify the lockfile and web typecheck resolve the selected packages.
- [x] 1.2 Add a reusable React Markdown message-body surface that renders common conversational Markdown from raw source text without `dangerouslySetInnerHTML`, and verify headings, paragraphs, emphasis, lists, blockquotes, inline code, fenced code, and tables produce structured output.
- [x] 1.3 Add the Markdown URL and element safety policy, including inert raw HTML, safe link schemes, and no network-loaded Markdown images, and verify unsafe HTML and `javascript:`-style URLs cannot produce active DOM behavior.

## 2. ACP Message Integration

- [x] 2.1 Ensure ACP user and agent message activities carry consistent Markdown semantics while preserving their original source text and existing activity IDs, order, and chunk coalescing, and verify normalization, manager, and browser-state tests cover streamed and unmarked histories.
- [x] 2.2 Replace ordinary ACP message and thought paragraph rendering with the shared Markdown body while retaining role labels, user/agent styling, collapsed thought behavior, and source-independent prompt submission, and verify both roles render Markdown without changing the sent prompt payload.
- [x] 2.3 Keep plans, tool calls, diffs, terminal output, locations, usage, turn states, and unknown activities on their existing renderers, and verify a mixed activity history still distinguishes each non-message activity correctly.

## 3. Responsive Conversation Styling

- [x] 3.1 Add scoped styles for rendered Markdown blocks, including headings, paragraphs, lists, blockquotes, inline code, fenced code, links, and tables, and verify the existing compact user/agent/thought visual distinction remains intact.
- [x] 3.2 Add overflow and narrow-card handling for long code lines, wide tables, and unbroken text without changing PTY terminal styling, and verify the ACP cards remain usable at desktop and mobile widths.

## 4. Regression And Acceptance Verification

- [x] 4.1 Extend web tests for both user and agent Markdown messages, thoughts, source preservation, incomplete streamed Markdown, safe HTML/URL handling, and unchanged non-message activity rendering.
- [x] 4.2 Extend ACP normalization and state tests for explicit Markdown metadata, omitted metadata defaulting to Markdown at the view boundary, and coalesced streamed updates retaining the complete raw source.
- [x] 4.3 Run `npm run typecheck` and `npm test` from the repository root and resolve any failures introduced by the change.
- [x] 4.4 Exercise the built browser acceptance matrix: user and agent Markdown render identically by role-neutral rules, streamed Markdown updates safely as content grows, code and tables remain readable, unsafe markup is inert, links are constrained, prompts are sent unchanged, and PTY/non-message activities remain unchanged.

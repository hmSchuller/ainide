## Context

The ACP server and browser already carry message source text in `AcpActivity.text`, and the shared activity type has optional format metadata. `AgentWorkbench` currently interpolates message text into a paragraph and uses `white-space: pre-wrap`; this is safe text rendering but provides no Markdown structure. The web package has no Markdown rendering dependency. See `proposal.md` for the motivation and `specs/acp-agent-sessions/spec.md` for the behavioral contract.

The ACP server should continue relaying source text rather than producing HTML. Provider output is external input even though the application is local-first, and user-authored Markdown must also remain available verbatim for prompt transport and inspection.

## Goals / Non-Goals

**Goals:**

- Give user, agent, and thought message bodies one consistent, safe Markdown rendering path.
- Keep message source text and streamed coalescing behavior unchanged.
- Support common GitHub-style conversational Markdown, including fenced code and tables.
- Prevent raw HTML, unsafe links, and external image loading from becoming an execution or tracking surface.
- Preserve the existing visual distinction between user messages, agent messages, and thoughts.
- Keep the implementation client-side and independent of ACP provider-specific APIs.

**Non-Goals:**

- Rendering tool output, diffs, terminal output, or plan activities as Markdown.
- Converting Markdown to HTML on the server or changing the ACP wire protocol.
- Editing, normalizing, or stripping Markdown from prompts before they are sent to providers.
- Adding rich Markdown editing or preview behavior to the composer.

## Decisions

### 1. Parse Markdown in the web client into React elements

Use a React-native Markdown renderer with GitHub-flavored Markdown support in `apps/web`. Do not use `dangerouslySetInnerHTML`, a server-generated HTML field, or a hand-written partial parser. A maintained renderer handles nested blocks and incomplete streamed syntax more reliably than a local subset, while React output avoids creating an HTML injection boundary.

The GFM extension covers tables, task-list syntax, strikethrough, and autolinks in addition to ordinary paragraphs, headings, lists, emphasis, blockquotes, inline code, and fenced code. The renderer receives the accumulated raw `activity.text` on every update, so existing message coalescing remains the sole source of truth for stream state.

**Alternative considered:** Parse Markdown with a small custom helper. Rejected because code fences, nested lists, tables, escaping, and partial streams would produce an inconsistent dialect and a larger security-sensitive maintenance burden.

### 2. Treat conversational message activities as Markdown regardless of role

The message renderer will apply to both `role: "user"` and `role: "agent"` message activities. Thoughts will use the same body renderer inside their existing collapsed `details` surface, retaining their subdued visual treatment. Existing optional format metadata can remain for protocol compatibility; absent format on a conversational message defaults to Markdown, and current user and agent message producers should publish Markdown semantics consistently when metadata is emitted.

Only `type: "message"` and thought message bodies use this renderer. Plans and operational activities continue using their current plain or preformatted views so code output, diffs, and terminal logs do not acquire chat-oriented typography or link behavior.

**Alternative considered:** Render only agent messages, or require an explicit `format: "markdown"` flag. Rejected because user messages are part of the same readable transcript and current message producers do not consistently provide that flag.

### 3. Make unsafe Markdown inert by construction

Do not enable a raw-HTML plugin. HTML-looking input must not create active DOM elements. Apply an explicit URL policy to Markdown links: permit only safe relative/hash links and approved schemes such as `http`, `https`, and `mailto`; unsafe schemes are rendered without an active link. Do not render Markdown images as network-loaded images, avoiding an implicit external request and tracking surface.

External links, when enabled, will use the existing browser navigation conventions and safe `rel` attributes when opened in a new context. Markdown links will not be interpreted as workspace file-open commands; provider-reported workspace locations retain their existing dedicated controls and path validation.

**Alternative considered:** Convert Markdown to HTML and sanitize the resulting string. Rejected because it adds a second parser/sanitizer boundary and makes it easier for a future change to accidentally re-enable unsafe raw HTML.

### 4. Keep source and presentation separate

The server continues to publish raw message text, and the browser store continues to accumulate streamed chunks exactly as it does now. The renderer is a view concern only: rendering a user prompt does not alter the request body, and rendering a stream does not alter its activity ID, role, order, or coalescing behavior. Any explicit format metadata remains data, not pre-rendered markup.

### 5. Style the rendered block surface explicitly

Wrap rendered bodies in a dedicated Markdown class and style its direct block children rather than relying on the current `.acp-message p` rule. Define readable spacing for headings, paragraphs, lists, and blockquotes; distinguish inline code from prose; and place fenced code and wide tables in horizontally scrollable containers. Keep long unbroken text from expanding the conversation card and preserve the existing compact cockpit scale on desktop and mobile.

### 6. Test rendering and safety at the web boundary

Add focused web tests for both roles, common Markdown constructs, raw HTML, unsafe URLs, source preservation, and streamed updates. Keep the tests Node-compatible by rendering the component or pure URL-policy helpers without introducing a browser-testing dependency. Existing ACP state tests remain responsible for message order and chunk coalescing; component tests verify that those accumulated values are presented as Markdown.

## Risks / Trade-offs

- **Risk:** A Markdown parser adds client bundle size and a new dependency. -> **Mitigation:** Keep parsing client-side, use one renderer plus the narrowly scoped GFM extension, and avoid adding a separate HTML sanitizer pipeline.
- **Risk:** Provider content can contain raw HTML or dangerous URLs. -> **Mitigation:** Disable raw HTML, enforce URL validation in the rendered link boundary, and prevent image requests.
- **Risk:** Incomplete fences or lists may change appearance during streaming. -> **Mitigation:** Reparse the accumulated source on each coalesced update and test partial Markdown states; transient formatting changes are preferable to exposing source as unsafe HTML.
- **Risk:** Rendered code or tables can exceed a narrow ACP card. -> **Mitigation:** Add overflow containers and responsive width rules without changing the outer conversation layout.
- **Risk:** Existing histories may omit format metadata. -> **Mitigation:** Default unmarked conversational messages to Markdown at the view boundary while retaining explicit metadata handling for future compatibility.

## Migration Plan

Install the selected web-only Markdown dependencies and deploy the frontend with the renderer enabled. No server migration, persisted-data migration, ACP provider change, or session restart is required because existing histories already contain source text. Rollback is a frontend rollback; raw message text and session state remain compatible with the prior renderer.

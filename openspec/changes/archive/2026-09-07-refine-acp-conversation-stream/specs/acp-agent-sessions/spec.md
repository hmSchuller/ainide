## MODIFIED Requirements

### Requirement: Users can send prompts and receive structured session updates

The system SHALL let the user send a text prompt with optional supported context to a selected ACP session and SHALL render updates associated with that session in chronological arrival order as a single conversation stream. The stream SHALL present each activity once at the position it arrived; the workbench SHALL NOT split the history into a summarized headline layer and a separate hidden or secondary raw-activity log. User and agent messages SHALL read as conversational content without uppercase section labels such as "Prompt", "Final response", or role badges as the primary presentation. Tool calls, plans, terminal activity, diffs, locations, usage, thoughts, completion markers, and unknown updates SHALL appear inline in the stream with compact, human-readable presentation; protocol details such as tool input or output JSON, full diff text, or unknown payload data SHALL be available only through explicit expand actions rather than as the default view. The rendered session history SHALL still distinguish user content, agent content, tool calls, plans, file locations, diffs, terminal output, usage information, completion, failure, and cancellation when those updates are provided. The text of every user or agent message activity SHALL be rendered as safe Markdown for display, while the original source text SHALL remain unchanged for prompt transport, history, and streaming accumulation. Markdown rendering SHALL not interpret untrusted raw HTML as executable markup or activate unsafe URL schemes.

#### Scenario: Agent streams a tool-assisted response

- **WHEN** the user sends a prompt and the agent emits message chunks followed by a tool call and further message chunks
- **THEN** the workbench appends the chunks to the correct conversation in order, shows the tool step inline with its reported title and status, renders each user or agent message as safe Markdown, and does not merge the activity into another session

#### Scenario: User message contains Markdown

- **WHEN** the user submits a prompt containing Markdown such as emphasis, a list, or a fenced code block
- **THEN** the conversation history presents the user message with the corresponding Markdown styling while the ACP prompt receives the original source text unchanged

#### Scenario: Agent message contains Markdown

- **WHEN** an agent message contains headings, paragraphs, links, inline code, a fenced code block, or other supported conversational Markdown
- **THEN** the workbench presents the agent message with the corresponding Markdown structure and styling without exposing the Markdown source as the only presentation

#### Scenario: Markdown arrives in streamed chunks

- **WHEN** additional chunks extend an existing user or agent message while its Markdown structure is incomplete or changes as the message grows
- **THEN** the workbench safely reparses the accumulated source and updates the rendered message in place without losing message order or treating the chunks as separate messages

#### Scenario: Message contains unsafe markup or a URL

- **WHEN** a user or agent message contains raw HTML or a link using an unsafe scheme
- **THEN** the workbench does not execute or render the raw HTML as active markup and does not create an active link for the unsafe URL

#### Scenario: Agent reports a file change

- **WHEN** an ACP update includes a file location or diff for a workspace file
- **THEN** the user can inspect the referenced file or change from the agent surface and the ordinary workspace change detection remains active

#### Scenario: Unknown update content is received

- **WHEN** the agent sends an update variant that the current UI does not understand
- **THEN** the session remains connected, preserves enough metadata for inspection or debugging, and reports the update inline without treating it as a completed prompt

#### Scenario: One prompt produces mixed activity

- **WHEN** an ACP prompt produces user messages, tool calls, intermediate agent messages, file locations, and completion in sequence
- **THEN** the conversation shows the full sequence in order without duplicating messages in a separate summary section or burying the sequence behind a collapsed raw-activity drawer

#### Scenario: Tool call details are inspectable on demand

- **WHEN** a tool call includes input or output payload data
- **THEN** the stream shows a compact tool row with the reported title and status by default and exposes the payload only when the user expands that tool step

#### Scenario: Agent thought content is present

- **WHEN** the provider emits an agent message marked as thought content
- **THEN** the stream presents it as secondary, collapsed, or visually de-emphasized content that does not compete with the main agent response

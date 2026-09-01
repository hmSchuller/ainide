## MODIFIED Requirements

### Requirement: Users can send prompts and receive structured session updates

The system SHALL let the user send a text prompt with optional supported context to a selected ACP session and SHALL render updates associated with that session in arrival order. The rendered session history SHALL distinguish user content, agent content, tool calls, plans, file locations, diffs, terminal output, usage information, completion, failure, and cancellation when those updates are provided. The text of every user or agent message activity SHALL be rendered as safe Markdown for display, while the original source text SHALL remain unchanged for prompt transport, history, and streaming accumulation. Markdown rendering SHALL not interpret untrusted raw HTML as executable markup or activate unsafe URL schemes.

#### Scenario: Agent streams a tool-assisted response

- **WHEN** the user sends a prompt and the agent emits message chunks followed by a tool call and further message chunks
- **THEN** the workbench appends the chunks to the correct conversation, shows the tool's progress and result, renders each user or agent message as safe Markdown, and does not merge the activity into another session

#### Scenario: User message contains Markdown

- **WHEN** the user submits a prompt containing Markdown such as emphasis, a list, or a fenced code block
- **THEN** the conversation history presents the user message with the corresponding Markdown styling while the ACP prompt receives the original source text unchanged

#### Scenario: Agent message contains Markdown

- **WHEN** an agent message contains headings, paragraphs, links, inline code, a fenced code block, or other supported conversational Markdown
- **THEN** the workbench presents the agent message with the corresponding Markdown structure and styling without exposing the Markdown source as the only presentation

#### Scenario: Markdown arrives in streamed chunks

- **WHEN** additional chunks extend an existing user or agent message while its Markdown structure is incomplete or changes as the message grows
- **THEN** the workbench safely reparses the accumulated source and updates the rendered message without losing message order or treating the chunks as separate messages

#### Scenario: Message contains unsafe markup or a URL

- **WHEN** a user or agent message contains raw HTML or a link using an unsafe scheme
- **THEN** the workbench does not execute or render the raw HTML as active markup and does not create an active link for the unsafe URL

#### Scenario: Agent reports a file change

- **WHEN** an ACP update includes a file location or diff for a workspace file
- **THEN** the user can inspect the referenced file or change from the agent surface and the ordinary workspace change detection remains active

#### Scenario: Unknown update content is received

- **WHEN** the agent sends an update variant that the current UI does not understand
- **THEN** the session remains connected, preserves enough metadata for inspection or debugging, and reports the update without treating it as a completed prompt

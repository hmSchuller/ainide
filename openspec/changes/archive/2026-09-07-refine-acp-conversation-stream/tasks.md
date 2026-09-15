## 1. Stream Renderer Foundation

- [x] 1.1 Add `AcpConversationStream` that maps `history[]` chronologically and wire it into `AgentWorkbench` in place of `AcpTurnNarrative`; verify the conversation area renders without turn cards or a raw-activity disclosure
- [x] 1.2 Derive `turnId` per activity from the preceding user message for inspection targets without using summary fields in the render path; verify file and diff actions still thread `turnId` and `activityId` through existing navigation tests
- [x] 1.3 Remove or retire `AcpTurnNarrative` and turn-card-only presentation code once the stream renderer is wired; verify no remaining references to raw-activity or turn-section markup in the web app

## 2. Stream Item Presentation

- [x] 2.1 Implement conversational user and agent message items with safe Markdown and no uppercase section or role labels; verify message and Markdown streaming tests still pass
- [x] 2.2 Implement compact tool, plan, terminal, location, and diff stream rows with human-readable titles and status; verify tool-assisted response scenarios show inline steps in arrival order
- [x] 2.3 Collapse thought messages by default and expose tool, terminal, diff, and unknown payload details only on explicit expand; verify expanded content does not duplicate the compact row title
- [x] 2.4 Render `turn`, `usage`, and legacy/unclassified bursts without turn-card chrome, using spacing or a subtle divider when no user prompt precedes activity; verify legacy replay fixtures remain inspectable

## 3. Stream Styling

- [x] 3.1 Replace turn-card and nested activity-box CSS with stream typography, compact tool rows, and exchange dividers; verify the conversation no longer shows bordered per-message boxes as the default
- [x] 3.2 Add `.cockpit-scroll` and `.cockpit-scroll-nested` utilities and apply them to `.acp-history`; verify the conversation scrollbar uses the styled thumb and track instead of the OS default
- [x] 3.3 Adjust conversation history padding and the floating `New activity` button layout for the styled scrollbar gutter; verify the button and scrollbar do not overlap at narrow widths

## 4. Regression And Release

- [x] 4.1 Update or replace `AcpTurnNarrative` and conversation component tests to assert chronological stream order, no duplicate messages, and expandable tool details; verify the updated tests pass
- [x] 4.2 Confirm bottom-follow scroll behavior, pending permission/auth panels, subagent strip, and inspection return navigation remain unchanged; verify existing AgentWorkbench and scroll-follow tests pass
- [x] 4.3 Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; verify all commands succeed

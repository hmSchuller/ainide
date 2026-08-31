## Why

ainide currently exposes agents as raw PTY processes driven by one configured command. That works for terminal-first use, but it prevents Cursor and OpenCode from sharing a structured conversation UI, tool activity, permissions, and model selection. ACP provides a common local protocol so ainide can present one web-based agent experience while each agent retains its own models and capabilities.

## What Changes

- Add a server-side ACP client bridge that can launch and maintain local ACP agent connections for Cursor and OpenCode.
- Add provider-aware ACP sessions with negotiated capabilities, authentication state, session lifecycle, and dynamically advertised model or other configuration options.
- Add a native web agent surface for conversation messages, code and file references, tool calls, command output, diffs, permissions, and session status.
- Keep shell, Lazygit, and optional raw CLI agent sessions available through the existing PTY path rather than treating ACP as a terminal program.
- Extend reference-kit behavior so captured code can be composed as ACP prompt context while preserving the existing explicit, non-submitting handoff behavior for PTY sessions.
- Preserve project scoping, mode switching, local session identity, and safe workspace boundaries for ACP sessions.
- Do not add agent-to-agent orchestration, automatic task chaining, hosted services, or a provider-independent model catalog.

## Capabilities

### New Capabilities

- `acp-agent-sessions`: Connect to local ACP agents, negotiate capabilities, create or resume sessions, select advertised model/configuration options, stream structured updates, and service the agent's permission, filesystem, and terminal requests within ainide's local workspace boundary.

### Modified Capabilities

- `agent-workbench`: Extend the existing agent workbench from PTY-only supervision to a unified ACP conversation and activity surface while retaining named sessions, project scoping, status, mode persistence, and raw PTY support.
- `agent-reference-handoff`: Allow references from the active editor and reference kit to become ACP prompt context or a composer draft for ACP sessions, while retaining provenance and avoiding implicit prompt submission.

## Impact

- `apps/server` gains ACP process supervision, stdio JSON-RPC transport, session lifecycle handling, capability negotiation, permissions, and safe filesystem/terminal bridges alongside the existing PTY manager.
- `packages/shared` gains protocol-facing and browser-facing types for ACP agent sessions, configuration options, conversation updates, tool activity, permissions, and model selection.
- `apps/web` gains the conversation/activity surface, prompt composer, model/configuration controls, approval interactions, structured tool and diff rendering, and ACP session state while reusing Monaco, xterm.js, Git, explorer, and existing styling tokens.
- Local session persistence must distinguish ACP session identifiers and resumability from recreated PTY processes without storing tokens or provider secrets.
- The server dependency set may add the official ACP TypeScript SDK and a small set of accessible headless UI primitives; the existing custom cockpit styling remains the visual foundation.

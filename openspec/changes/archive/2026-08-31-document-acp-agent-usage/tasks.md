## 1. Document ACP Architecture

- [x] 1.1 Update the `AGENTS.md` project overview and structure to identify ACP-backed conversations as an AI interface alongside real PTY sessions, and verify the wording matches the current README and server modules
- [x] 1.2 Add concise contributor guidance distinguishing `agentCommand` PTY sessions from `acpAgents` local ACP providers, including direct command/argument spawning, provider-owned authentication and model options, and a pointer to the README configuration guide; verify no full setup guide is duplicated

## 2. Record ACP Invariants

- [x] 2.1 Document in `AGENTS.md` the ACP workspace boundary, explicit permission handling, session-token protection, provider-process lifecycle, and persistence restrictions, and verify each statement is supported by `openspec/specs/acp-agent-sessions/spec.md`

## 3. Validate Documentation

- [x] 3.1 Review the changed `AGENTS.md` against `README.md`, the ACP specification, and the source configuration shape for terminology or contradiction, and verify the final diff is documentation-only
- [x] 3.2 Run `openspec validate document-acp-agent-usage --type change` and verify the change validates successfully with specs intentionally skipped

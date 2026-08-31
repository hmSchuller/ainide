## Context

See `proposal.md` for the motivation. The current implementation has two agent transports: a configured `agentCommand` starts raw PTY sessions, while entries in `acpAgents` start local ACP providers over direct command-and-argument pairs. The server owns the ACP connection and keeps the browser-facing session scoped to its project and workspace.

`README.md` already contains user-facing provider examples and troubleshooting. The existing `openspec/specs/acp-agent-sessions/spec.md` is the behavioral reference for ACP capabilities, permissions, path boundaries, lifecycle, and persistence.

## Goals / Non-Goals

**Goals:**

- Make `AGENTS.md` accurate for contributors working across the server, web client, and shared protocol types.
- Explain the PTY versus ACP distinction without turning contributor guidance into a protocol tutorial.
- Preserve the key local-first and security boundaries that must remain true when changing ACP code.
- Point readers to `README.md` for configuration examples and operational troubleshooting.

**Non-Goals:**

- Change ACP behavior, provider discovery, configuration parsing, or session persistence.
- Add provider-specific setup instructions beyond a brief reference to the existing README.
- Duplicate the full ACP protocol requirements or API surface in `AGENTS.md`.
- Modify the main OpenSpec capability specifications.

## Decisions

### Keep the contributor note in `AGENTS.md`

Add a compact ACP architecture note to the existing project and implementation guidance, where contributors already look for system boundaries and invariants. Keeping it there makes the document reflect the current architecture rather than treating ACP as an undocumented implementation detail.

Alternative considered: put the information only in `README.md`. Rejected because the README is primarily user onboarding, while `AGENTS.md` is the repository's contributor contract.

### Describe transports by responsibility, not protocol internals

State that PTY sessions are real terminals driven by `agentCommand`, while ACP sessions are structured conversations driven by configured local providers. Mention direct command/argument spawning, provider-owned authentication and model options, and server-owned lifecycle and project scoping. Link to the README for the concrete `acpAgents` JSON shape.

Alternative considered: document ACP methods and event types in `AGENTS.md`. Rejected because those details belong in shared types, source code, and the ACP specification and would become stale quickly.

### Make safety boundaries explicit

Include the invariants most relevant to future edits: ACP filesystem and terminal requests stay inside the selected workspace, permission requests require explicit user handling, browser/API and WebSocket access retains the local session token, and persisted descriptors do not contain credentials or live protocol state.

Alternative considered: rely only on the generic local-first bullets already present. Rejected because they do not identify how ACP requests and provider processes participate in those boundaries.

## Risks / Trade-offs

- [Documentation drift] ACP behavior or configuration may evolve while the contributor note remains unchanged -> Keep the note concise, cross-check wording against the ACP spec and README, and avoid enumerating unstable protocol details.
- [Overloaded contributor guidance] Adding user setup material could make `AGENTS.md` harder to scan -> Limit it to architecture, invariants, and a README pointer.
- [Ambiguous agent terminology] “Agent” can refer to a PTY process, an ACP provider, or an ainide session -> Use “PTY session,” “ACP provider,” and “ainide ACP session” consistently.

## Migration Plan

This is a documentation-only update. Add the note to the root `AGENTS.md`, verify the referenced README sections and existing ACP specification still match, and run the repository's normal documentation-independent checks only if the implementation workflow requires them. Rollback is limited to removing the documentation changes; no data or runtime migration is needed.

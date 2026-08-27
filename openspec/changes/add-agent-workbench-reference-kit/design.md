## Context

See `proposal.md` for the motivation. The current web shell has Edit and Review as the two modes in `App.tsx`, while `TerminalPanel` is rendered below both mode surfaces. Terminal sessions are already real PTYs, are project-scoped by the multi-project change, and retain server-side scrollback across browser disconnects. The current terminal UI presents a tab strip with one visible xterm at a time.

The current project UI bag already swaps tabs, panes, Git state, terminals, and mode per active project. The disk snapshot stores terminal kinds but not session identities or counts. Monaco supplies a visible text buffer, but the application has no reference actions, persistent line marks, or reference-kit state.

Reference insertion must remain an explicit PTY interaction. The server must not gain a generic HTTP command-execution endpoint; the authenticated terminal WebSocket input path is the existing boundary for sending text to a chosen session.

## Goals / Non-Goals

**Goals:**

- Make Agents a first-class, full-height work surface while keeping Edit and Review available as peer modes.
- Let several named agent PTYs run for one active project and let the user focus one or optionally view two.
- Make code reading and context handoff possible without leaving the code surface.
- Capture reference content and provenance in browser memory, serialize it deterministically, and insert it into an explicitly selected live agent without submitting it.
- Recreate multiple recorded agent sessions after process restart using the current configured agent command.
- Preserve the existing active-project boundary and PTY survival behavior.

**Non-Goals:**

- A process-wide Agents dashboard showing agents from hidden projects simultaneously.
- Independent active projects for separate browser windows or tabs.
- Git worktree, branch, locking, or conflict isolation for parallel agents.
- Inferring agent intent or state such as planning, thinking, waiting, or editing from PTY output.
- Persisting reference-kit contents, terminal scrollback, PTY IDs, process IDs, or session tokens.
- Automatically submitting a prompt after inserting a reference.
- Replacing Monaco editing behavior or removing the ability to edit files.

## Decisions

### 1. Add Agents as a peer mode, with a handoff bridge in Edit

The top-level navigation becomes conceptually:

```text
[Project]     [Edit] [Agents] [Review]
```

Agents mode owns the large session navigator and terminal stage. Edit retains a compact agent/reference dock containing the current kit and handoff target. This keeps the frequent read-and-handoff loop short while giving supervision enough room when the user wants to watch processes.

The terminal footer is removed as the primary visual surface rather than merely being moved unchanged. A small utility treatment can still expose shell and tool sessions. A persistent footer alone was rejected because it makes agent sessions secondary and leaves parallel sessions hidden behind tabs. A right-only rail was rejected as the sole surface because raw terminal output and two-session observation need more width.

### 2. Keep Agents active-project scoped

Agents mode reads the active project's terminal list, and the reference kit is stored with that project's browser-lifetime UI bag. Switching projects swaps both the visible session list and the reference kit. Hidden project PTYs continue running through the existing server registry, but they are not shown in the active project's Agents mode.

This preserves the completed multi-project contract and keeps file references unambiguous. A global monitor was rejected for this change because it would require new semantics for selecting a hidden project's terminal, opening its file references, and deciding whether selecting an agent changes the active project.

### 3. Represent agent sessions independently from terminal-kind reconciliation

The shared session snapshot gains an optional list of agent descriptors, conceptually:

```text
agentSessions: [{ title }]
```

Each descriptor represents one agent window, so two sessions with the same kind remain two sessions. The configured agent command is used at recreation time and is not copied into the snapshot. Existing `terminalKinds` remains the compatibility path for non-agent default tools and for older snapshots that only know that an agent kind existed.

The client must not run default-kind reconciliation in a way that replaces or deduplicates explicitly restored agent descriptors. Manual creation of another agent always produces another session. Session titles are the user-facing way to distinguish purposes such as `Implement` and `Plan next task`; no new inferred role protocol is introduced.

### 4. Use a focused terminal plus optional second pane

The Agents workbench contains a session navigator and a terminal stage. One session is focused by default. The user can pin one additional agent for a two-pane view; tool sessions can be selected but are not counted as agents.

The PTY remains owned by the server, not by the visible React mode. Terminal connections should be managed so changing modes does not kill a process or lose its scrollback. A session that is not currently mounted can be reattached when selected and receive the server's existing scrollback. At most the focused and pinned sessions need active visual xterm mounts for the Agents view, which avoids scaling every terminal view with the number of sessions.

### 5. Add references to the project UI bag, but never to disk snapshots

The browser state gains a reference kit per project. A reference item contains, conceptually:

```text
{
  id,
  path,
  startLine?,
  endLine?,
  wholeFile,
  content,
  language
}
```

Paths are workspace-relative. When a selection is added, its bounds are normalized to inclusive complete lines and the visible buffer content is captured immediately. This means a user can mark context, let an agent change the file, and still hand off exactly what was read; the item can display its original path and range. A whole-file item uses the visible open buffer when available and otherwise reads the active project's text file.

The kit is copied when the user asks to copy or hand off it. Copying does not consume or mutate it. The kit is included in same-page project bag swaps but deliberately excluded from `ProjectSessionSnapshot`, so a browser reload does not restore potentially large or sensitive context.

### 6. Serialize references as deterministic plain text

Single references and kits use a readable, deterministic format with a path-and-range heading, language-aware code fencing where possible, and clear separators between files. The format is plain text so it works with the system clipboard and with an interactive agent regardless of terminal implementation.

The serializer is a pure client-side boundary. It does not re-read or save files during copying, does not include absolute workspace paths, and preserves the order shown in the kit. Copying a selection directly uses the same serializer as copying a one-item kit.

### 7. Insert through the authenticated PTY path, without submission

The code dock and Agents workbench share a selected live-agent target. A direct handoff sends the serialized reference as terminal input through the existing authenticated terminal WebSocket connection for that session. If the target is not currently connected visually, the client can attach a short-lived connection before sending and then close that connection; the PTY remains alive.

The handoff operation sends no trailing newline and does not invoke a submit action. If the target is dead, missing, or no longer belongs to the active project, the user receives an error and the reference remains available for clipboard copying. The client only offers targets from the active project's agent list, and the server-side session ownership check must prevent a stale target from becoming a cross-project handoff.

### 8. Keep reference controls prominent in the reading surface

The existing editor toolbar is extended with actions for the current selection and current file. The reference dock exposes the kit, its item count, the selected handoff target, and Copy/Paste actions. Explorer and tab file actions can add a whole file without requiring it to be manually edited.

The normal editor selection remains transient. The explicit `Add selection to kit` action is the durable marking operation for this change; persistent gutter bookmarks were rejected because they add editor decoration and bookmark lifecycle without improving the multi-file handoff loop.

## Risks / Trade-offs

- **Risk:** A large whole-file or multi-file handoff can overwhelm an interactive agent or terminal input buffer. -> **Mitigation:** Show item and size information before handoff, keep ordinary clipboard copy available, and do not auto-submit the inserted text.
- **Risk:** Inserting into an agent that is waiting at an unexpected prompt can still affect its input state. -> **Mitigation:** Show the explicit target, require a user gesture, send no newline, and preserve clipboard fallback.
- **Risk:** Two agents can modify the same checkout concurrently and create conflicting writes. -> **Mitigation:** Keep worktree isolation out of scope but document shared-root behavior; retain existing external-change conflict handling for the human reading surface.
- **Risk:** Captured references can become stale after an agent changes a file. -> **Mitigation:** Capture content intentionally at mark time and display the path and line range so the user can decide whether to refresh or remove the item.
- **Risk:** Recreating multiple agents after restart can surprise users if the configured command has changed. -> **Mitigation:** Persist titles and session count, use the current configured command, and make restored sessions visibly identifiable as new processes.
- **Risk:** Old session snapshots only contain deduplicated terminal kinds. -> **Mitigation:** Treat the new agent-descriptor field as optional and fall back to the existing kind-based restoration path.
- **Risk:** Rendering several xterms increases browser resource use. -> **Mitigation:** Default to one focused view, cap the optional tiled view at two, and rely on server scrollback for sessions mounted on demand.

## Migration Plan

Deploy the shared types, server, and web client together because the mode and snapshot shapes are coupled. Existing snapshots without agent descriptors continue through the current terminal-kind fallback. New snapshots write agent descriptors for separately recorded agent sessions while leaving reference kits and terminal output out of the file.

No repository data migration is required. On rollback, the new session metadata can be ignored by the older implementation and the user can continue using the existing terminal panel; any live PTYs remain subject to the server version that owns them. Reference kits are browser-memory state and disappear on reload or rollback.

## Why

ainide's terminal footer can run agents, but it makes parallel agent work feel like a collection of hidden terminal tabs. The primary human workflow is reading code, selecting useful context, handing it to one of several agents, and observing the resulting work rather than manually editing files.

## What Changes

- Add an `Agents` primary mode beside the existing Edit and Review modes.
- Present all agent sessions for the active project in a dedicated workbench with named sessions, reliable alive/exited status, launch controls, and terminal output.
- Allow more than one agent session to run for a project and optionally view two selected agent sessions side by side.
- Keep shell, Lazygit, and custom PTYs available as secondary tools rather than making the bottom terminal footer the main navigation surface.
- Add reference-first actions to the code surface for copying a selected line range or a whole file with path and line provenance.
- Add a per-project, browser-lifetime reference kit that can contain selections from multiple files and can be copied or explicitly inserted into a selected agent without automatically submitting terminal input.
- Keep the reference handoff available from the code surface through a compact agent/reference dock, so switching to the full Agents mode is not required for every handoff.
- Preserve active-project scoping: agents continue running for hidden projects, while the Agents workbench and reference kit show only the active project's sessions and references.
- Extend session restoration to retain enough user-created agent session descriptors to recreate multiple recorded agent windows after an ainide process restart; PTY identities and process output remain non-persistent.

## Capabilities

### New Capabilities

- `agent-workbench`: A first-class Agents mode for running, naming, selecting, observing, and restoring multiple agent sessions for the active project.
- `agent-reference-handoff`: Reading-oriented code references, multi-file reference kits, and safe handoff of references to agent sessions.

### Modified Capabilities

<!-- The completed multi-project work is still an unarchived change, so its project-sessions delta is not a main capability under openspec/specs/. Agent-session restoration is specified as part of the new agent-workbench capability. -->

## Impact

- `apps/web`: Add the Agents mode, session navigator, optional split terminal view, reference actions, reference-kit state, and compact handoff dock; extend per-project UI bags and mode handling.
- `apps/server`: Expose enough terminal/session metadata for multiple agent sessions and support explicit reference insertion through the existing authenticated PTY path without introducing a generic command-execution endpoint.
- `packages/shared`: Extend mode and terminal snapshot/domain types shared by the web and server; reference-kit contents can remain browser-local.
- Session persistence: Update the existing local session snapshot format without persisting tokens, PTY IDs, terminal scrollback, or reference-kit contents.
- Existing Edit, Review, project switching, path safety, and terminal survival behavior must remain intact.

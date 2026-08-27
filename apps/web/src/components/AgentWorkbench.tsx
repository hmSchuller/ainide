import type { TerminalSession } from "@ainide/shared";
import { closeTerminal, renameTerminal } from "../api";
import { useAppStore } from "../store";
import { TerminalView } from "./TerminalPanel";

interface AgentWorkbenchProps {
  onNewAgent: () => void;
  onNewTool: (kind: TerminalSession["kind"]) => void;
  onOpenReference: (path: string, line: number, column?: number) => void;
}

function SessionStatus({ session }: { session: TerminalSession }) {
  return <span className={`agent-status ${session.alive ? "live" : "exited"}`}><i />{session.alive ? "live" : "exited"}</span>;
}

export function AgentWorkbench({ onNewAgent, onNewTool, onOpenReference }: AgentWorkbenchProps) {
  const token = useAppStore((state) => state.token);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const terminals = useAppStore((state) => state.terminals);
  const focusedSessionId = useAppStore((state) => state.focusedSessionId);
  const pinnedSessionId = useAppStore((state) => state.pinnedSessionId);
  const toolSessionId = useAppStore((state) => state.toolSessionId);
  const referenceTargetId = useAppStore((state) => state.referenceTargetId);
  const setFocusedSession = useAppStore((state) => state.setFocusedSession);
  const setPinnedSession = useAppStore((state) => state.setPinnedSession);
  const setToolSession = useAppStore((state) => state.setToolSession);
  const setReferenceTarget = useAppStore((state) => state.setReferenceTarget);
  const updateTerminal = useAppStore((state) => state.updateTerminal);
  const removeTerminal = useAppStore((state) => state.removeTerminal);
  const projectTerminals = terminals.filter((terminal) => terminal.projectId === activeProjectId);
  const agents = projectTerminals.filter((terminal) => terminal.kind === "agent");
  const tools = projectTerminals.filter((terminal) => terminal.kind !== "agent");
  const focused = agents.find((session) => session.id === focusedSessionId) ?? agents[0];
  const pinned = agents.find((session) => session.id === pinnedSessionId && session.id !== focused?.id);
  const selectedTool = tools.find((session) => session.id === toolSessionId) ?? tools[0];
  const visibleAgents = [focused, pinned].filter((session): session is TerminalSession => Boolean(session));
  const liveAgents = agents.filter((session) => session.alive);

  const close = async (session: TerminalSession) => {
    if (session.alive && !window.confirm(`Close the running ${session.title} agent?`)) return;
    try { await closeTerminal(session.id, token); } catch { /* A disconnected process is already closed. */ }
    removeTerminal(session.id);
    if (focusedSessionId === session.id) setFocusedSession(undefined);
    if (pinnedSessionId === session.id) setPinnedSession(undefined);
    if (referenceTargetId === session.id) setReferenceTarget(undefined);
  };

  const rename = (session: TerminalSession) => {
    const title = window.prompt("Rename agent session", session.title);
    if (!title || !token) return;
    void renameTerminal(session.id, title, token).then((updated) => updateTerminal(session.id, updated)).catch(() => undefined);
  };

  const focus = (session: TerminalSession) => {
    setFocusedSession(session.id);
    if (session.kind === "agent") setReferenceTarget(session.alive ? session.id : referenceTargetId);
    else setToolSession(session.id);
  };

  return <section className="agent-workbench" aria-label="Agents workbench">
    <aside className="agent-navigator">
      <header className="agent-navigator-header"><div><span className="eyebrow">AGENT WORKBENCH</span><strong>{agents.length} {agents.length === 1 ? "agent" : "agents"}</strong></div><button className="primary-button compact" onClick={onNewAgent}>+ New agent</button></header>
      <div className="agent-navigator-body">
        <section className="session-group"><div className="session-group-heading"><span>AGENTS</span><b>{agents.length}</b></div>
          {agents.length === 0 ? <div className="session-empty">No agent sessions yet.<button onClick={onNewAgent}>Start an agent</button></div> : agents.map((session) => <div className={`session-row ${session.id === focused?.id ? "selected" : ""}`} key={session.id}>
            <button className="session-select" onClick={() => focus(session)} title={`Focus ${session.title}`}><span className="session-title">{session.title}</span><SessionStatus session={session} /></button>
            <div className="session-actions"><button onClick={() => { setFocusedSession(session.id); setReferenceTarget(session.alive ? session.id : undefined); }} aria-label={`Target ${session.title}`} title="Use as handoff target">◎</button><button onClick={() => setPinnedSession(pinned?.id === session.id ? undefined : session.id)} aria-label={`${pinned?.id === session.id ? "Unpin" : "Pin"} ${session.title}`} title={pinned?.id === session.id ? "Unpin agent" : "Pin agent"}>{pinned?.id === session.id ? "▣" : "□"}</button><button onClick={() => rename(session)} aria-label={`Rename ${session.title}`} title="Rename agent">✎</button><button onClick={() => void close(session)} aria-label={`Close ${session.title}`} title="Close agent">×</button></div>
          </div>)}
        </section>
        <section className="session-group tool-group"><div className="session-group-heading"><span>TOOLS</span><b>{tools.length}</b></div>
          <div className="tool-launchers"><button onClick={() => onNewTool("shell")}>+ Shell</button><button onClick={() => onNewTool("lazygit")}>+ Lazygit</button><button onClick={() => onNewTool("custom")}>+ Custom</button></div>
          {tools.map((session) => <div className={`session-row tool-row ${session.id === selectedTool?.id ? "selected" : ""}`} key={session.id}><button className="session-select" onClick={() => focus(session)} title={`Open ${session.title}`}><span className="session-title">{session.title}</span><SessionStatus session={session} /></button><div className="session-actions"><button onClick={() => rename(session)} aria-label={`Rename ${session.title}`} title="Rename terminal">✎</button><button onClick={() => void close(session)} aria-label={`Close ${session.title}`} title="Close terminal">×</button></div></div>)}
        </section>
      </div>
      <footer className="agent-target"><label htmlFor="agent-target">HANDOFF TARGET</label><select id="agent-target" value={referenceTargetId ?? ""} onChange={(event) => setReferenceTarget(event.target.value || undefined)}><option value="">No live agent selected</option>{liveAgents.map((session) => <option value={session.id} key={session.id}>{session.title}</option>)}</select><span>{referenceTargetId && liveAgents.some((session) => session.id === referenceTargetId) ? "Ready for reference insertion" : "Choose a live agent from here or Edit"}</span></footer>
    </aside>
    <div className="agent-stage">
      {visibleAgents.length ? <div className={`agent-terminal-grid ${visibleAgents.length > 1 ? "split" : ""}`}>{visibleAgents.map((session) => <article className="agent-terminal-card" key={session.id}><header><div><span className="eyebrow">{session.id === focused?.id ? "FOCUSED SESSION" : "PINNED SESSION"}</span><strong>{session.title}</strong></div><SessionStatus session={session} /></header><TerminalView session={session} onOpenReference={onOpenReference} /></article>)}</div> : selectedTool ? <article className="agent-terminal-card tool-terminal-card"><header><div><span className="eyebrow">TOOL SESSION</span><strong>{selectedTool.title}</strong></div><SessionStatus session={selectedTool} /></header><TerminalView session={selectedTool} onOpenReference={onOpenReference} /></article> : <div className="agent-empty"><span className="agent-empty-mark">◎</span><p className="eyebrow">NO AGENTS RUNNING</p><h2>Start a parallel work window.</h2><p>Use named sessions for implementation, planning, or any other task you want to watch.</p><button className="primary-button" onClick={onNewAgent}>Start first agent</button></div>}
      {visibleAgents.length > 0 && selectedTool && <article className="agent-tool-card"><header><button className="tool-strip-title" onClick={() => focus(selectedTool)}><span className="eyebrow">UTILITY TOOL</span><strong>{selectedTool.title}</strong></button><SessionStatus session={selectedTool} /></header><TerminalView session={selectedTool} onOpenReference={onOpenReference} /></article>}
    </div>
  </section>;
}

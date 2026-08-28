import { useEffect, useState } from "react";
import type { TerminalSession } from "@ainide/shared";
import { closeTerminal, createTerminal } from "../api";
import { lazygitTerminals, selectLazygitSession } from "../terminal-ownership";
import { useAppStore } from "../store";
import { TerminalView } from "./TerminalPanel";

interface LazyGitSurfaceProps {
  onOpenReference: (path: string, line: number, column?: number) => void;
}

export function LazyGitSurface({ onOpenReference }: LazyGitSurfaceProps) {
  const token = useAppStore((state) => state.token);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const allTerminals = useAppStore((state) => state.terminals);
  const terminalError = useAppStore((state) => state.terminalError);
  const addTerminal = useAppStore((state) => state.addTerminal);
  const removeTerminal = useAppStore((state) => state.removeTerminal);
  const setTerminalError = useAppStore((state) => state.setTerminalError);
  const sessions = lazygitTerminals(allTerminals, activeProjectId);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = selectLazygitSession(sessions, selectedId);

  useEffect(() => {
    if (selected?.id && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected?.id, selectedId]);

  const restart = async () => {
    if (!token) return;
    try {
      const created = await createTerminal("lazygit", token);
      addTerminal(created);
      setSelectedId(created.id);
      setTerminalError(undefined);
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "Lazygit is unavailable. Install lazygit to use LazyGit mode.");
    }
  };

  const close = async (session: TerminalSession) => {
    if (session.alive && !window.confirm(`Close the running ${session.title} session?`)) return;
    try { await closeTerminal(session.id, token); } catch { /* A disconnected process is already closed. */ }
    removeTerminal(session.id);
    if (selectedId === session.id) setSelectedId(undefined);
  };

  if (sessions.length === 0) {
    return <section className="lazygit-surface" aria-label="LazyGit mode">
      <div className="lazygit-empty">
        <span className="eyebrow">LAZYGIT</span>
        <h2>{terminalError ? "Lazygit is unavailable" : "No Lazygit session yet"}</h2>
        <p>{terminalError ?? "Start Lazygit to work with Git interactively in this project."}</p>
        <button className="primary-button" onClick={() => void restart()}>{terminalError ? "Retry Lazygit" : "Start Lazygit"}</button>
      </div>
    </section>;
  }

  return <section className="lazygit-surface" aria-label="LazyGit mode">
    <header className="lazygit-header">
      <div className="lazygit-tabs">
        <span className="eyebrow">LAZYGIT</span>
        {sessions.length > 1 && sessions.map((session) => <button key={session.id} className={session.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(session.id)}>{session.title || "Lazygit"}<i className={session.alive ? "alive" : "dead"} /></button>)}
        {sessions.length === 1 && selected && <strong>{selected.title || "Lazygit"}</strong>}
      </div>
      <div className="lazygit-controls">
        {!selected?.alive && <button className="primary-button compact" onClick={() => void restart()}>Restart Lazygit</button>}
        {selected && <button onClick={() => void close(selected)} title="Close session">×</button>}
      </div>
    </header>
    {!selected?.alive && <div className="lazygit-status-banner"><b>Lazygit exited</b><span>{terminalError ?? "The process stopped. Restart Lazygit or close this session."}</span></div>}
    {selected?.alive && terminalError && <div className="lazygit-status-banner warning"><b>Lazygit note</b><span>{terminalError}</span></div>}
    {selected ? <div className="lazygit-terminal"><TerminalView session={selected} onOpenReference={onOpenReference} /></div> : <div className="lazygit-empty"><p>Select a Lazygit session to continue.</p></div>}
  </section>;
}

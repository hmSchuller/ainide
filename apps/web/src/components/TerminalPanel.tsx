import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { TerminalSession } from "@ainide/shared";
import { closeTerminal, renameTerminal, websocketUrl } from "../api";
import { persistLayout, useAppStore } from "../store";

interface TerminalPanelProps {
  onNewTerminal: (kind?: TerminalSession["kind"]) => void;
  onOpenReference: (path: string, line: number, column?: number) => void;
}

export function TerminalView({ session, onOpenReference }: { session: TerminalSession; onOpenReference: TerminalPanelProps["onOpenReference"] }) {
  const token = useAppStore((state) => state.token);
  const workspace = useAppStore((state) => state.workspace);
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [connection, setConnection] = useState<"connecting" | "connected" | "closed">("connecting");
  const [error, setError] = useState<string>();
  const updateTerminal = useAppStore((state) => state.updateTerminal);

  useEffect(() => {
    if (!mountRef.current) return;
    const terminal = new Terminal({ cursorBlink: true, fontFamily: "'SFMono-Regular', Menlo, monospace", fontSize: 12, theme: { background: "#101318", foreground: "#d9e1eb", cursor: "#75e0b4", selectionBackground: "#294153" }, convertEol: true });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mountRef.current);
    terminalRef.current = terminal;
    const resize = () => {
      try {
        fit.fit();
        if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "resize", sessionId: session.id, cols: terminal.cols, rows: terminal.rows }));
      } catch { /* The terminal may be closing during a resize. */ }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mountRef.current);
    const socket = new WebSocket(websocketUrl("/terminal", token, { sessionId: session.id }));
    let disposed = false;
    socketRef.current = socket;
    socket.onopen = () => {
      if (disposed) { socket.close(); return; }
      setConnection("connected");
      socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
      resize();
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; data?: string; message?: string; exitCode?: number | null };
         if (message.type === "output") terminal.write(message.data ?? "");
         if (message.type === "error") {
           setConnection("closed");
           setError(message.message ?? "Terminal connection was rejected");
         }
         if (message.type === "exit") {
          updateTerminal(session.id, { alive: false });
          terminal.write(`\r\n\x1b[90m[process exited${message.exitCode == null ? "" : ` with ${message.exitCode}`} ]\x1b[0m\r\n`);
          setError(session.kind === "lazygit" ? "Lazygit is not available in this workspace." : undefined);
        }
      } catch {
        terminal.write(String(event.data));
      }
    };
    socket.onerror = () => { if (!disposed) { setConnection("closed"); setError("Terminal connection failed. Is the server running?"); } };
    socket.onclose = () => { if (!disposed) setConnection("closed"); };
    terminal.registerLinkProvider({
      provideLinks: (lineNumber, callback) => {
        const text = terminal.buffer.active.getLine(lineNumber - 1)?.translateToString() ?? "";
        const links: { range: { start: { x: number; y: number }; end: { x: number; y: number } }; text: string; activate: () => void }[] = [];
        const pattern = /(?:^|[\s("'])((?:\.\.?[\\/])?[\w./\\-]+):(\d+)(?::(\d+))?/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text))) {
          const value = match[1] + ":" + match[2] + (match[3] ? `:${match[3]}` : "");
          const start = (match.index ?? 0) + (match[0].length - value.length) + 1;
          const file = match[1];
          const line = Number(match[2]);
          const column = match[3] ? Number(match[3]) : undefined;
          links.push({
            range: { start: { x: start, y: lineNumber }, end: { x: start + value.length - 1, y: lineNumber } },
            text: value,
            activate: () => {
              if (!file || !workspace) return;
              const normalizedFile = file.replaceAll("\\", "/");
              const root = workspace.rootPath.replaceAll("\\", "/").replace(/\/$/, "");
              const relativeFile = normalizedFile.startsWith(`${root}/`) ? normalizedFile.slice(root.length + 1) : normalizedFile.replace(/^\.\//, "");
              onOpenReference(relativeFile, line, column);
            },
          });
        }
        callback(links);
      },
    });
    const input = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", sessionId: session.id, data }));
    });
    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => socket.close();
        socket.onerror = null;
      } else if (socket.readyState === WebSocket.OPEN) socket.close();
      terminal.dispose();
      socketRef.current = null;
    };
  }, [session.id, session.kind, token, updateTerminal]);

  return <div className="terminal-view">
    <div className="terminal-connection">{error ?? (connection === "connected" ? "connected" : "connecting")}</div>
    <div ref={mountRef} className="xterm-mount" />
  </div>;
}

export function TerminalPanel({ onNewTerminal, onOpenReference }: TerminalPanelProps) {
  const allTerminals = useAppStore((state) => state.terminals);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const terminals = allTerminals.filter((terminal) => terminal.projectId === activeProjectId && terminal.kind !== "agent");
  const token = useAppStore((state) => state.token);
  const activeTerminalId = useAppStore((state) => state.activeTerminalId);
  const terminalError = useAppStore((state) => state.terminalError);
  const activeHeight = useAppStore((state) => state.terminalHeight);
  const collapsed = useAppStore((state) => state.terminalCollapsed);
  const maximized = useAppStore((state) => state.terminalMaximized);
  const setTerminalCollapsed = useAppStore((state) => state.setTerminalCollapsed);
  const setTerminalMaximized = useAppStore((state) => state.setTerminalMaximized);
  const setActiveTerminal = useAppStore((state) => state.setActiveTerminal);
  const updateTerminal = useAppStore((state) => state.updateTerminal);
  const setHeight = (height: number) => {
    const next = Math.max(150, Math.min(window.innerHeight - 130, height));
    useAppStore.setState({ terminalHeight: next });
    persistLayout(undefined, next);
  };
  const dragging = useRef(false);
  const selectedTerminalId = terminals.some((terminal) => terminal.id === activeTerminalId) ? activeTerminalId : terminals[0]?.id;
  useEffect(() => {
    const move = (event: PointerEvent) => { if (dragging.current) setHeight(window.innerHeight - event.clientY); };
    const up = () => { dragging.current = false; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  });

  const close = async (session: TerminalSession) => {
    if (session.alive && !window.confirm(`Close the running ${session.title} terminal?`)) return;
    try { await closeTerminal(session.id, token); } catch { /* A disconnected process is already closed. */ }
    useAppStore.getState().removeTerminal(session.id);
  };

  return <section className={`terminal-panel ${collapsed ? "collapsed" : ""} ${maximized ? "maximized" : ""}`} style={collapsed || maximized ? undefined : { height: activeHeight }}>
    {!collapsed && !maximized && <div className="splitter" onPointerDown={() => { dragging.current = true; }} title="Drag to resize terminal" />}
    <header className="terminal-header">
      <div className="terminal-tabs">
        <span className="eyebrow">TERMINAL</span>
        {terminals.map((terminal) => <button key={terminal.id} className={terminal.id === activeTerminalId ? "active" : ""} onClick={() => setActiveTerminal(terminal.id)} onDoubleClick={() => {
          const nextTitle = window.prompt("Rename terminal", terminal.title);
          if (!nextTitle || !token) return;
          void renameTerminal(terminal.id, nextTitle, token).then((updated) => updateTerminal(terminal.id, updated)).catch(() => undefined);
        }}>{terminal.title || terminal.kind}<i className={terminal.alive ? "alive" : "dead"} /></button>)}
        <button className="new-terminal" onClick={() => onNewTerminal()} title="New shell">+</button>
      </div>
      <div className="terminal-controls">
        <button onClick={() => setTerminalMaximized(!maximized)} title="Maximize terminal">{maximized ? "⤢" : "⤡"}</button>
        <button onClick={() => { setTerminalCollapsed(!collapsed); if (!collapsed) setTerminalMaximized(false); }} title="Collapse terminal">{collapsed ? "⌃" : "⌄"}</button>
      </div>
    </header>
    {!collapsed && <div className="terminal-body">
       {terminalError && (!selectedTerminalId || terminals.find((terminal) => terminal.id === selectedTerminalId)?.kind === "lazygit") && <div className="terminal-error-state"><b>{terminalError}</b><span>Open Shell from the command palette to continue.</span></div>}
       {terminals.length === 0 ? <div className="terminal-empty">No terminal sessions. Use <button onClick={() => onNewTerminal("shell")}>+ Shell</button> to start one.</div> : terminals.map((terminal) => <div className={`terminal-instance ${terminal.id === selectedTerminalId ? "visible" : "hidden"}`} key={terminal.id}><TerminalView session={terminal} onOpenReference={onOpenReference} /><button className="terminal-close" onClick={() => void close(terminal)} title="Close terminal">×</button></div>)}
    </div>}
  </section>;
}

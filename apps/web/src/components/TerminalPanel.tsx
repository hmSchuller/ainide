import "@xterm/xterm/css/xterm.css";
import type { TerminalSession } from "@ainide/shared";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { closeTerminal, renameTerminal, websocketUrl } from "../api";
import { persistLayout, useAppStore } from "../store";
import { utilityTerminals } from "../terminal-ownership";

interface TerminalPanelProps {
  onNewTerminal: (kind?: TerminalSession["kind"]) => void;
  onOpenReference: (path: string, line: number, column?: number) => void;
}

export function TerminalView({ session, onOpenReference }: { session: TerminalSession; onOpenReference: TerminalPanelProps["onOpenReference"] }) {
  const token = useAppStore((state) => state.token);
  const workspace = useAppStore((state) => state.workspace);
  const updateTerminal = useAppStore((state) => state.updateTerminal);
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const processAliveRef = useRef(session.alive);
  const [connection, setConnection] = useState<"connecting" | "reconnecting" | "connected" | "closed">("connecting");
  const [error, setError] = useState<string>();

  const workspaceRef = useRef(workspace);
  const onOpenReferenceRef = useRef(onOpenReference);
  workspaceRef.current = workspace;
  onOpenReferenceRef.current = onOpenReference;
  processAliveRef.current = session.alive;

  useEffect(() => {
    if (!mountRef.current) return;
    const terminal = new Terminal({ cursorBlink: true, fontFamily: "'SFMono-Regular', Menlo, monospace", fontSize: 12, theme: { background: "#101318", foreground: "#d9e1eb", cursor: "#75e0b4", selectionBackground: "#294153" }, convertEol: true });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mountRef.current);
    terminalRef.current = terminal;
    let disposed = false;
    let reconnectTimer: number | undefined;

    const resize = () => {
      try {
        fit.fit();
        if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "resize", sessionId: session.id, cols: terminal.cols, rows: terminal.rows }));
      } catch { /* The terminal may be closing during a resize. */ }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mountRef.current);

    const connect = () => {
      if (disposed) return;
      setConnection(reconnectTimer === undefined ? "connecting" : "reconnecting");
      const socket = new WebSocket(websocketUrl("/terminal", token, { sessionId: session.id }));
      socketRef.current = socket;
      socket.onopen = () => {
        if (disposed) { socket.close(); return; }
        setConnection("connected");
        setError(undefined);
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
            processAliveRef.current = false;
            updateTerminal(session.id, { alive: false });
            terminal.write(`\r\n\x1b[90m[process exited${message.exitCode == null ? "" : ` with ${message.exitCode}`} ]\x1b[0m\r\n`);
            setConnection("closed");
            setError(undefined);
            if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
            reconnectTimer = undefined;
          }
        } catch {
          // Output is opaque PTY data. It is displayed, never interpreted.
          terminal.write(String(event.data));
        }
      };
      socket.onerror = () => {
        if (!disposed) setError("Terminal connection failed. Is the server running?");
      };
      socket.onclose = () => {
        if (disposed || socketRef.current !== socket) return;
        socketRef.current = null;
        if (processAliveRef.current) {
          setConnection("reconnecting");
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = undefined;
            connect();
          }, 500);
        } else {
          setConnection("closed");
        }
      };
    };
    connect();

    terminal.registerLinkProvider({
      provideLinks: (lineNumber, callback) => {
        const text = terminal.buffer.active.getLine(lineNumber - 1)?.translateToString() ?? "";
        const links: { range: { start: { x: number; y: number }; end: { x: number; y: number } }; text: string; activate: () => void }[] = [];
        const pattern = /(?:^|[\s("'])((?:\.\.?[\\/])?[\w./\\-]+):(\d+)(?::(\d+))?/g;
        let match: RegExpExecArray | null = pattern.exec(text);
        while (match !== null) {
          const value = `${match[1]}:${match[2]}${match[3] ? `:${match[3]}` : ""}`;
          const start = (match.index ?? 0) + (match[0].length - value.length) + 1;
          const file = match[1];
          const line = Number(match[2]);
          const column = match[3] ? Number(match[3]) : undefined;
          links.push({
            range: { start: { x: start, y: lineNumber }, end: { x: start + value.length - 1, y: lineNumber } },
            text: value,
            activate: () => {
              const currentWorkspace = workspaceRef.current;
              if (!file || !currentWorkspace) return;
              const normalizedFile = file.replaceAll("\\", "/");
              const root = currentWorkspace.rootPath.replaceAll("\\", "/").replace(/\/$/, "");
              const relativeFile = normalizedFile.startsWith(`${root}/`) ? normalizedFile.slice(root.length + 1) : normalizedFile.replace(/^\.\//, "");
              onOpenReferenceRef.current(relativeFile, line, column);
            },
          });
          match = pattern.exec(text);
        }
        callback(links);
      },
    });
    const input = terminal.onData((data) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "input", sessionId: session.id, data }));
    });
    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (socketRef.current?.readyState === WebSocket.CONNECTING) {
        socketRef.current.onopen = () => socketRef.current?.close();
        socketRef.current.onerror = null;
      } else if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.close();
      socketRef.current = null;
      terminal.dispose();
    };
  }, [session.id, token, updateTerminal]);

  return <section className="terminal-view" aria-label={`${session.title} terminal`}>
    {error && <div className="terminal-connection terminal-error" role="alert">{error}</div>}
    {!error && <div className="terminal-connection" role="status">{session.alive ? "process alive" : "process exited"} · {connection}</div>}
    <div ref={mountRef} className="xterm-mount" />
  </section>;
}

export function TerminalPanel({ onNewTerminal, onOpenReference }: TerminalPanelProps) {
  const allTerminals = useAppStore((state) => state.terminals);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const terminals = utilityTerminals(allTerminals, activeProjectId);
  const token = useAppStore((state) => state.token);
  const activeTerminalId = useAppStore((state) => state.activeTerminalId);
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
        {terminals.map((terminal) => <button type="button" key={terminal.id} className={terminal.id === activeTerminalId ? "active" : ""} onClick={() => setActiveTerminal(terminal.id)} onDoubleClick={() => {
          const nextTitle = window.prompt("Rename terminal", terminal.title);
          if (!nextTitle || !token) return;
          void renameTerminal(terminal.id, nextTitle, token).then((updated) => updateTerminal(terminal.id, updated)).catch(() => undefined);
        }}>{terminal.title || terminal.kind}<i className={terminal.alive ? "alive" : "dead"} /></button>)}
        <button type="button" className="new-terminal" onClick={() => onNewTerminal()} title="New shell">+</button>
      </div>
      <div className="terminal-controls">
        <button type="button" onClick={() => setTerminalMaximized(!maximized)} title="Maximize terminal">{maximized ? "⤢" : "⤡"}</button>
        <button type="button" onClick={() => { const next = !collapsed; if (maximized) setTerminalMaximized(false); setTerminalCollapsed(next); }} title="Collapse terminal">{collapsed ? "⌃" : "⌄"}</button>
      </div>
    </header>
    <div className={`terminal-body ${collapsed ? "collapsed-hidden" : ""}`}>
       {terminals.length === 0 ? <div className="terminal-empty">No utility terminals. Use <button type="button" onClick={() => onNewTerminal("shell")}>+ Shell</button> to start one.</div> : terminals.map((terminal) => <div className={`terminal-instance ${terminal.id === selectedTerminalId ? "visible" : "hidden"}`} key={terminal.id}><TerminalView session={terminal} onOpenReference={onOpenReference} /><button type="button" className="terminal-close" onClick={() => void close(terminal)} title="Close terminal">×</button></div>)}
    </div>
  </section>;
}

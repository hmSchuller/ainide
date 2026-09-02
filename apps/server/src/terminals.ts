import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { TerminalClientMessage, TerminalServerMessage, TerminalSession } from "@ainide/shared";
import pty from "node-pty";
import type { WebSocket } from "ws";
import type { AinideConfig } from "./config.js";
import { bundledToolPath, withToolsPath } from "./tools.js";

type LiveTerminal = {
  session: TerminalSession;
  process: pty.IPty;
  clients: Set<WebSocket>;
  scrollback: string;
  exitCode?: number | null;
};

const require = createRequire(import.meta.url);

function ensureSpawnHelperExecutable(): void {
  // Some package managers unpack node-pty's helper without its executable bit.
  const packageRoot = path.resolve(path.dirname(require.resolve("node-pty")), "..");
  const helper = path.join(packageRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");
  if (!existsSync(helper)) return;
  try { chmodSync(helper, 0o755); } catch { /* The native package may be read-only in a packaged build. */ }
}

export class TerminalManager {
  private sessions = new Map<string, LiveTerminal>();

  constructor(private readonly getCwd: () => string | undefined, private readonly config: AinideConfig = {}) {}

  list(projectId?: string): TerminalSession[] {
    const sessions = [...this.sessions.values()].map(({ session }) => ({ ...session }));
    return projectId ? sessions.filter((session) => session.projectId === projectId) : sessions;
  }

  listAliveKinds(projectId: string): TerminalSession["kind"][] {
    return this.list(projectId).filter((session) => session.alive).map((session) => session.kind);
  }

  create(input: { kind?: unknown; title?: unknown; command?: unknown; cols?: unknown; rows?: unknown }): TerminalSession {
    const kind = input.kind === "agent" || input.kind === "shell" || input.kind === "lazygit" || input.kind === "custom" || input.kind === "build" ? input.kind : "shell";
    const cwd = this.getCwd();
    if (!cwd) throw new TerminalError(409, "Open a workspace before creating a terminal");
    if (kind === "lazygit" && !isAvailable("lazygit")) throw new TerminalError(400, "lazygit is not installed or is not available on PATH");
    if (kind === "build") {
      if (typeof input.command !== "string" || !input.command.trim()) throw new TerminalError(400, "A non-empty command is required for a build terminal");
      if (this.list(cwd).some((session) => session.kind === "build" && session.alive)) throw new TerminalError(409, "A build is already running for this project");
    }
    const shell = this.config.defaultShell?.trim() || process.env.SHELL || "/bin/sh";
    const configuredAgent = this.config.agentCommand?.trim();
    const command = kind === "agent" ? configuredAgent || shell : kind === "lazygit" ? bundledToolPath("lazygit") ?? "lazygit" : kind === "build" ? input.command as string : shell;
    const cols = validDimension(input.cols, 120);
    const rows = validDimension(input.rows, 40);
    const id = randomUUID();
    const session: TerminalSession = {
      id,
      title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : titleFor(kind),
      command,
      cwd,
      kind,
      projectId: cwd,
      alive: true,
    };
    ensureSpawnHelperExecutable();
    let processHandle: pty.IPty;
    try {
      processHandle = pty.spawn(shell, ["-lc", command], {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env: withToolsPath({ ...process.env, TERM: "xterm-256color" }) as Record<string, string>,
      });
    } catch (error) {
      throw new TerminalError(503, `Unable to start terminal: ${error instanceof Error ? error.message : "PTY unavailable"}`);
    }
    session.pid = processHandle.pid;
    const live: LiveTerminal = { session, process: processHandle, clients: new Set(), scrollback: "" };
    this.sessions.set(id, live);
    processHandle.onData((data) => {
      live.scrollback = `${live.scrollback}${data}`.slice(-128_000);
      this.broadcast(live, { type: "output", sessionId: id, data });
    });
    processHandle.onExit(({ exitCode }) => {
      session.alive = false;
      live.exitCode = typeof exitCode === "number" ? exitCode : null;
      this.broadcast(live, { type: "exit", sessionId: id, exitCode: typeof exitCode === "number" ? exitCode : null });
    });
    return { ...session };
  }

  remove(id: string, projectId = this.getCwd()): boolean {
    const live = this.sessions.get(id);
    if (!live || !projectId || live.session.projectId !== projectId) return false;
    if (live.session.kind === "build" && live.session.alive) {
      // Stopping a build terminates the process but keeps the exited session:
      // attached views observe the exit and the tab remains in the panel.
      live.process.kill();
      return true;
    }
    return this.removeLive(id, live);
  }

  rename(id: string, title: string, projectId = this.getCwd()): TerminalSession | undefined {
    const live = this.sessions.get(id);
    const cleanTitle = title.trim();
    if (!live || !projectId || live.session.projectId !== projectId || !cleanTitle || cleanTitle.length > 80) return undefined;
    live.session.title = cleanTitle;
    return { ...live.session };
  }

  connect(socket: WebSocket, initialId?: string, projectId?: string): void {
    if (!initialId) {
      const waitForAttach = (raw: Buffer | string) => {
        try {
          const message = parseClientMessage(JSON.parse(raw.toString()));
          if (message.type !== "attach") throw new Error("The first terminal message must be attach");
          socket.removeListener("message", waitForAttach);
          this.attach(message.sessionId, socket, projectId);
        } catch (error) {
          socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Invalid terminal message" }));
        }
      };
      socket.on("message", waitForAttach);
      return;
    }
    this.attach(initialId, socket, projectId);
  }

  private attach(id: string, socket: WebSocket, projectId?: string): void {
    const live = this.sessions.get(id);
    const activeProjectId = this.getCwd();
    if (!live || !activeProjectId || live.session.projectId !== activeProjectId || (projectId !== undefined && live.session.projectId !== projectId)) {
      socket.send(JSON.stringify({ type: "error", message: live ? "Terminal session does not belong to the active project" : "Terminal session not found" }));
      socket.close(1008);
      return;
    }
    live.clients.add(socket);
    socket.send(JSON.stringify({ type: "attached", sessionId: id } satisfies TerminalServerMessage));
    if (live.scrollback) socket.send(JSON.stringify({ type: "output", sessionId: id, data: live.scrollback } satisfies TerminalServerMessage));
    if (!live.session.alive) socket.send(JSON.stringify({ type: "exit", sessionId: id, exitCode: live.exitCode ?? null } satisfies TerminalServerMessage));
    const remove = () => live.clients.delete(socket);
    socket.on("close", remove);
    socket.on("message", (raw) => {
      try {
        const message = parseClientMessage(JSON.parse(raw.toString()));
        if (message.type !== "attach" && message.sessionId !== id) throw new Error("Session id does not match this connection");
        if (message.type === "input") {
          if (!this.isActiveProject(live)) return this.reject(socket, "Terminal session does not belong to the active project");
          if (!live.session.alive) return this.reject(socket, "Terminal session is not alive");
          live.process.write(message.data);
        }
        else if (message.type === "resize") {
          if (!this.isActiveProject(live)) return this.reject(socket, "Terminal session does not belong to the active project");
          if (!validDimension(message.cols, undefined) || !validDimension(message.rows, undefined)) throw new Error("Invalid terminal dimensions");
          live.process.resize(message.cols, message.rows);
        }
      } catch (error) {
        socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Invalid terminal message" }));
      }
    });
  }

  closeByProject(projectId: string): void {
    for (const [id, live] of this.sessions) {
      if (live.session.projectId === projectId) this.removeLive(id, live);
    }
  }

  close(): void {
    for (const [id, live] of this.sessions) this.removeLive(id, live);
  }

  private broadcast(live: LiveTerminal, message: TerminalServerMessage): void {
    const serialized = JSON.stringify(message);
    for (const client of live.clients) {
      if (client.readyState === 1) client.send(serialized);
    }
  }

  private isActiveProject(live: LiveTerminal): boolean {
    const activeProjectId = this.getCwd();
    return Boolean(activeProjectId && live.session.projectId === activeProjectId);
  }

  private reject(socket: WebSocket, message: string): void {
    socket.send(JSON.stringify({ type: "error", message }));
    socket.close(1008, message);
  }

  private removeLive(id: string, live: LiveTerminal): boolean {
    if (live.session.alive) live.process.kill();
    for (const client of live.clients) client.close();
    this.sessions.delete(id);
    return true;
  }
}

export class TerminalError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

function validDimension(value: unknown, fallback: number | undefined): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 500) throw new TerminalError(400, "Terminal dimensions must be integers between 1 and 500");
  return value;
}

function isAvailable(command: string): boolean {
  if (bundledToolPath(command)) return true;
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore", env: withToolsPath(process.env) });
  return result.status === 0;
}

function titleFor(kind: TerminalSession["kind"]): string {
  return kind === "lazygit" ? "Lazygit" : kind.charAt(0).toUpperCase() + kind.slice(1);
}

function parseClientMessage(value: unknown): TerminalClientMessage {
  if (!value || typeof value !== "object") throw new Error("Invalid terminal message");
  const message = value as Record<string, unknown>;
  if ((message.type !== "attach" && message.type !== "input" && message.type !== "resize") || typeof message.sessionId !== "string" || !message.sessionId) {
    throw new Error("Invalid terminal message");
  }
  if (message.type === "input") {
    if (typeof message.data !== "string") throw new Error("Terminal input must be a string");
    return { type: "input", sessionId: message.sessionId, data: message.data };
  }
  if (message.type === "resize") return { type: "resize", sessionId: message.sessionId, cols: message.cols as number, rows: message.rows as number };
  return { type: "attach", sessionId: message.sessionId };
}

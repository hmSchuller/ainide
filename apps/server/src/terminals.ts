import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { TerminalClientMessage, TerminalServerMessage, TerminalSession } from "@ainide/shared";
import pty from "node-pty";
import type { WebSocket } from "ws";
import type { AinideConfig } from "./config.js";

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

  list(): TerminalSession[] {
    return [...this.sessions.values()].map(({ session }) => ({ ...session }));
  }

  create(input: { kind?: unknown; title?: unknown; command?: unknown; cols?: unknown; rows?: unknown }): TerminalSession {
    const kind = input.kind === "agent" || input.kind === "shell" || input.kind === "lazygit" || input.kind === "custom" ? input.kind : "shell";
    const cwd = this.getCwd();
    if (!cwd) throw new TerminalError(409, "Open a workspace before creating a terminal");
    if (kind === "lazygit" && !isAvailable("lazygit")) throw new TerminalError(400, "lazygit is not installed or is not available on PATH");
    const shell = this.config.defaultShell?.trim() || process.env.SHELL || "/bin/sh";
    const configuredAgent = this.config.agentCommand?.trim();
    const command = kind === "agent" ? configuredAgent || shell : kind === "lazygit" ? "lazygit" : shell;
    const cols = validDimension(input.cols, 120);
    const rows = validDimension(input.rows, 40);
    const id = randomUUID();
    const session: TerminalSession = {
      id,
      title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : titleFor(kind),
      command,
      cwd,
      kind,
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
        env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
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

  remove(id: string): boolean {
    const live = this.sessions.get(id);
    if (!live) return false;
    if (live.session.alive) live.process.kill();
    for (const client of live.clients) client.close();
    this.sessions.delete(id);
    return true;
  }

  rename(id: string, title: string): TerminalSession | undefined {
    const live = this.sessions.get(id);
    const cleanTitle = title.trim();
    if (!live || !cleanTitle || cleanTitle.length > 80) return undefined;
    live.session.title = cleanTitle;
    return { ...live.session };
  }

  connect(socket: WebSocket, initialId?: string): void {
    if (!initialId) {
      const waitForAttach = (raw: Buffer | string) => {
        try {
          const message = JSON.parse(raw.toString()) as TerminalClientMessage;
          if (message.type !== "attach") throw new Error("The first terminal message must be attach");
          socket.removeListener("message", waitForAttach);
          this.attach(message.sessionId, socket);
        } catch (error) {
          socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Invalid terminal message" }));
        }
      };
      socket.on("message", waitForAttach);
      return;
    }
    this.attach(initialId, socket);
  }

  private attach(id: string, socket: WebSocket): void {
    const live = this.sessions.get(id);
    if (!live) {
      socket.send(JSON.stringify({ type: "error", message: "Terminal session not found" }));
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
        const message = JSON.parse(raw.toString()) as TerminalClientMessage;
        if (message.type !== "attach" && message.sessionId !== id) throw new Error("Session id does not match this connection");
        if (message.type === "input") live.process.write(message.data);
        else if (message.type === "resize") {
          if (!validDimension(message.cols, undefined) || !validDimension(message.rows, undefined)) throw new Error("Invalid terminal dimensions");
          live.process.resize(message.cols, message.rows);
        }
      } catch (error) {
        socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Invalid terminal message" }));
      }
    });
  }

  close(): void {
    for (const id of this.sessions.keys()) this.remove(id);
  }

  private broadcast(live: LiveTerminal, message: TerminalServerMessage): void {
    const serialized = JSON.stringify(message);
    for (const client of live.clients) {
      if (client.readyState === 1) client.send(serialized);
    }
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
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
  return result.status === 0;
}

function titleFor(kind: TerminalSession["kind"]): string {
  return kind === "lazygit" ? "Lazygit" : kind.charAt(0).toUpperCase() + kind.slice(1);
}

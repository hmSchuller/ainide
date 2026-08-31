import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as acp from "@agentclientprotocol/sdk";
import type { AcpSession } from "@ainide/shared";
import { resolveAcpDirectory } from "./paths.js";

const DEFAULT_OUTPUT_BYTES = 128_000;
const MAX_OUTPUT_BYTES = 1_000_000;

type AcpTerminal = {
  id: string;
  ownerSessionId: string;
  child: ChildProcess;
  output: Buffer;
  outputByteLimit: number;
  truncated: boolean;
  alive: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
  closed: Promise<void>;
  resolveClosed: () => void;
};

export class AcpTerminalManager {
  private readonly terminals = new Map<string, AcpTerminal>();

  async create(session: AcpSession, params: acp.CreateTerminalRequest): Promise<acp.CreateTerminalResponse> {
    const cwd = await resolveAcpDirectory(sessionWorkspace(session), params.cwd);
    if (!params.command.trim() || params.command.includes("\0")) throw new Error("ACP terminal command is invalid");
    if (params.args?.some((arg) => typeof arg !== "string" || arg.includes("\0"))) throw new Error("ACP terminal arguments are invalid");
    const env = { ...process.env } as Record<string, string>;
    for (const variable of params.env ?? []) {
      if (!variable.name || variable.name.includes("=") || variable.name.includes("\0") || variable.value.includes("\0")) {
        throw new Error("Invalid ACP terminal environment variable");
      }
      env[variable.name] = variable.value;
    }
    const child = spawn(params.command, params.args ?? [], { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const requestedOutputLimit = params.outputByteLimit ?? DEFAULT_OUTPUT_BYTES;
    const outputByteLimit = Number.isInteger(requestedOutputLimit)
      ? Math.min(Math.max(requestedOutputLimit, 1), MAX_OUTPUT_BYTES)
      : DEFAULT_OUTPUT_BYTES;
    let resolveClosed: () => void = () => undefined;
    const terminal: AcpTerminal = {
      id: randomUUID(),
      ownerSessionId: session.id,
      child,
      output: Buffer.alloc(0),
      outputByteLimit,
      truncated: false,
      alive: true,
      exitCode: null,
      signal: null,
      closed: new Promise<void>((resolve) => { resolveClosed = resolve; }),
      resolveClosed: () => resolveClosed(),
    };
    this.terminals.set(terminal.id, terminal);
    const append = (chunk: Buffer | string) => {
      const next = Buffer.concat([terminal.output, Buffer.from(chunk)]);
      if (next.byteLength > terminal.outputByteLimit) terminal.truncated = true;
      terminal.output = next.subarray(Math.max(0, next.byteLength - terminal.outputByteLimit));
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", (error) => this.finish(terminal, null, null, error));
    child.once("exit", (code, signal) => this.finish(terminal, code, signal));
    return { terminalId: terminal.id };
  }

  output(session: AcpSession, terminalId: string): acp.TerminalOutputResponse {
    const terminal = this.require(session, terminalId);
    return {
      output: new TextDecoder().decode(terminal.output),
      truncated: terminal.truncated,
      ...(!terminal.alive ? { exitStatus: { exitCode: terminal.exitCode, signal: terminal.signal } } : {}),
    };
  }

  async waitForExit(session: AcpSession, terminalId: string): Promise<acp.WaitForTerminalExitResponse> {
    const terminal = this.require(session, terminalId);
    await terminal.closed;
    return { exitCode: terminal.exitCode, signal: terminal.signal };
  }

  kill(session: AcpSession, terminalId: string): acp.KillTerminalResponse {
    const terminal = this.require(session, terminalId);
    if (terminal.alive) terminal.child.kill();
    return {};
  }

  async release(session: AcpSession, terminalId: string): Promise<acp.ReleaseTerminalResponse> {
    const terminal = this.require(session, terminalId);
    if (terminal.alive) terminal.child.kill();
    await terminal.closed;
    this.terminals.delete(terminalId);
    return {};
  }

  async closeSession(sessionId: string): Promise<void> {
    await Promise.all([...this.terminals.values()]
      .filter((terminal) => terminal.ownerSessionId === sessionId)
      .map(async (terminal) => {
        if (terminal.alive) terminal.child.kill();
        await terminal.closed;
        this.terminals.delete(terminal.id);
      }));
  }

  async close(): Promise<void> {
    await Promise.all([...this.terminals.values()].map(async (terminal) => {
      if (terminal.alive) terminal.child.kill();
      await terminal.closed;
    }));
    this.terminals.clear();
  }

  private require(session: AcpSession, terminalId: string): AcpTerminal {
    const terminal = this.terminals.get(terminalId);
    if (!terminal || terminal.ownerSessionId !== session.id) throw new Error("ACP terminal does not belong to this session");
    return terminal;
  }

  private finish(terminal: AcpTerminal, code: number | null, signal: NodeJS.Signals | null, error?: Error): void {
    if (!terminal.alive) return;
    terminal.alive = false;
    terminal.exitCode = code;
    terminal.signal = signal;
    terminal.error = error;
    terminal.resolveClosed();
  }
}

function sessionWorkspace(session: AcpSession): string {
  // The manager binds callbacks to a project's fixed root before they reach this class.
  return session.projectId;
}

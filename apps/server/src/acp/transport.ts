import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { ndJsonStream, type Stream } from "@agentclientprotocol/sdk";

const MAX_STDERR_BYTES = 16_384;

export interface AcpTransportSpec {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface AcpProcessExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

export interface AcpTransport {
  readonly child: ChildProcess;
  readonly stream: Stream;
  readonly closed: Promise<AcpProcessExit>;
  stderr(): string;
  close(): void;
}

export type AcpSpawn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export function openAcpTransport(spec: AcpTransportSpec, spawnProcess: AcpSpawn = spawn): AcpTransport {
  const child = spawnProcess(spec.command, [...spec.args], {
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env ?? {}) },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (!child.stdin || !child.stdout) {
    child.kill();
    throw new Error("ACP provider did not expose stdio pipes");
  }

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-MAX_STDERR_BYTES);
  });

  let settled = false;
  let resolveClosed: (exit: AcpProcessExit) => void = () => undefined;
  const closed = new Promise<AcpProcessExit>((resolve) => { resolveClosed = resolve; });
  const settle = (exit: AcpProcessExit) => {
    if (settled) return;
    settled = true;
    resolveClosed(exit);
  };
  child.once("error", (error) => settle({ code: null, signal: null, error }));
  child.once("exit", (code, signal) => settle({ code, signal }));

  return {
    child,
    stream: ndJsonStream(
      Writable.toWeb(child.stdin) as unknown as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
    ),
    closed,
    stderr: () => stderr,
    close: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    },
  };
}

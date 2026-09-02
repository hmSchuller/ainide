import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { busyPortMessage, isBusyPortError, listen } from "./listen.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const { port } = socket.address() as { port: number };
      socket.close(() => resolve(port));
    });
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

interface EntryHandle {
  pid: number;
  exit: Promise<{ code: number }>;
  output: () => string;
  kill: () => void;
}

function spawnEntry(port: number, sessionsPath: string, configPath: string): EntryHandle {
  // Run the source entrypoint in a single node process (via the tsx loader) so
  // signals such as SIGHUP reach the process that owns the server directly.
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(port),
      AINIDE_SESSIONS: sessionsPath,
      AINIDE_CONFIG: configPath,
      AINIDE_NO_UPDATE_CHECK: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (chunk) => { out += chunk.toString(); });
  child.stderr.on("data", (chunk) => { out += chunk.toString(); });
  const exit = new Promise<{ code: number }>((resolve) => {
    child.on("exit", (code) => resolve({ code: code ?? -1 }));
  });
  return {
    pid: child.pid ?? -1,
    exit,
    output: () => out,
    kill: () => { try { child.kill("SIGKILL"); } catch { /* already gone */ } },
  };
}

async function waitFor(needle: string, output: () => string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (output().includes(needle)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for "${needle}"; output:\n${output()}`);
}

describe("server lifecycle hardening", () => {
  it("performs graceful teardown on SIGHUP and persists the snapshot", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-sighup-"));
    const sessionsPath = path.join(dir, "sessions.json");
    const configPath = path.join(dir, "config.json");
    const port = await freePort();
    try {
      const entry = spawnEntry(port, sessionsPath, configPath);
      await waitFor("ainide is running at", entry.output);
      process.kill(entry.pid, "SIGHUP");
      const { code } = await withTimeout(entry.exit, 20000);
      expect(code).toBe(0);
      const snapshot = JSON.parse(await readFile(sessionsPath, "utf8")) as { version: number; projects: unknown[] };
      expect(snapshot.version).toBeTypeOf("number");
      expect(Array.isArray(snapshot.projects)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("performs the same graceful teardown on SIGTERM", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ainide-sigterm-"));
    const sessionsPath = path.join(dir, "sessions.json");
    const configPath = path.join(dir, "config.json");
    const port = await freePort();
    try {
      const entry = spawnEntry(port, sessionsPath, configPath);
      await waitFor("ainide is running at", entry.output);
      process.kill(entry.pid, "SIGTERM");
      const { code } = await withTimeout(entry.exit, 20000);
      expect(code).toBe(0);
      const snapshot = JSON.parse(await readFile(sessionsPath, "utf8")) as { projects: unknown[] };
      expect(Array.isArray(snapshot.projects)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("recognizes a real second-listen EADDRINUSE as a busy-port error", async () => {
    const host = "127.0.0.1";
    const first = Fastify({ logger: false });
    await first.listen({ port: 0, host });
    const { port } = (first.server.address() as { port: number });
    const second = Fastify({ logger: false });
    let caught: unknown;
    try {
      await second.listen({ port, host });
    } catch (error) {
      caught = error;
    }
    expect(isBusyPortError(caught)).toBe(true);
    await first.close();
  });

  it("reports a busy port with an actionable message and non-zero exit instead of a stack trace", async () => {
    const host = "127.0.0.1";
    const first = Fastify({ logger: false });
    await first.listen({ port: 0, host });
    const { port } = (first.server.address() as { port: number });
    const messages: string[] = [];
    let exitCode: number | undefined;
    const second = Fastify({ logger: false });
    await expect(
      listen(second, host, port, {
        log: (message) => messages.push(message),
        exit: (code) => { exitCode = code; throw new Error("exited"); },
      }),
    ).rejects.toThrow("exited");
    expect(messages).toEqual([busyPortMessage(port)]);
    expect(exitCode).toBe(1);
    await first.close();
  });

  it("rethrows non-busy-port listen errors unchanged", async () => {
    const second = Fastify({ logger: false });
    const messages: string[] = [];
    await expect(
      listen(second, "127.0.0.1", 100000, { log: (message) => messages.push(message), exit: () => { throw new Error("exited"); } }),
    ).rejects.toThrow();
    expect(messages).toEqual([]);
  });
});

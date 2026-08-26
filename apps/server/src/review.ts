import { spawn, spawnSync } from "node:child_process";
import { request } from "node:http";
import { createServer } from "node:net";
import type { ReviewScope, ReviewStatus } from "@ainide/shared";

const READINESS_TIMEOUT_MS = 10_000;
const READINESS_POLL_MS = 100;
const REVIEW_HOST = "127.0.0.1";

export function buildDifitArgs(scope: ReviewScope, port: number): string[] {
  const args = [...reviewPositionals(scope)];
  if (scope === "working-tree") args.push("--include-untracked");
  args.push("--no-open", "--host", REVIEW_HOST, "--port", String(port));
  return args;
}

function reviewPositionals(scope: ReviewScope): string[] {
  switch (scope) {
    case "staged": return ["staged"];
    case "last-commit": return ["HEAD~1", "HEAD"];
    case "branch-vs-main": return ["main", "HEAD"];
    default: return ["."];
  }
}

export function validateReviewScope(scope: ReviewScope, cwd: string): string | undefined {
  if (scope !== "branch-vs-main") return undefined;
  const result = spawnSync("git", ["rev-parse", "--verify", "main"], { cwd, stdio: "ignore" });
  if (result.status !== 0) return "Review scope branch vs main requires a main branch in this repository";
  return undefined;
}

export function isCommandAvailable(command: string): boolean {
  return spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

export async function waitForHttpReady(
  port: number,
  timeoutMs = READINESS_TIMEOUT_MS,
  pollMs = READINESS_POLL_MS,
  isAlive: () => boolean = () => true,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) return { ok: false, message: "difit exited before becoming ready" };
    try {
      const statusCode = await probeHttp(port);
      if (statusCode === 200) return { ok: true };
    } catch {
      // Difit is still starting.
    }
    await sleep(pollMs);
  }
  return { ok: false, message: `Difit did not become ready within ${timeoutMs}ms` };
}

function probeHttp(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: REVIEW_HOST, port, path: "/", method: "GET", timeout: 500 }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("probe timeout"));
    });
    req.end();
  });
}

export interface ReviewLaunchOptions {
  isCommandAvailable?: (command: string) => boolean;
  waitForHttpReady?: typeof waitForHttpReady;
  spawn?: typeof spawn;
}

export class ReviewManager {
  private child?: ReturnType<typeof spawn>;
  private status: ReviewStatus = { running: false, available: false };
  private port?: number;
  private scope?: ReviewScope;

  constructor(
    private readonly getCwd: () => string | undefined,
    private readonly launchOptions: ReviewLaunchOptions = {},
  ) {}

  getStatus(): ReviewStatus {
    return { ...this.status };
  }

  async start(scope: unknown, restart = false): Promise<ReviewStatus> {
    const selectedScope = normalizeScope(scope);
    if (!restart && this.child && this.status.running && this.scope === selectedScope) return this.getStatus();
    await this.stop();
    const cwd = this.getCwd();
    if (!cwd) {
      this.status = { running: false, available: false, message: "Open a workspace before starting a review" };
      return this.getStatus();
    }
    if (!(this.launchOptions.isCommandAvailable ?? isCommandAvailable)("difit")) {
      this.status = { running: false, available: false, message: "difit is not installed or is not available on PATH" };
      return this.getStatus();
    }
    const scopeError = validateReviewScope(selectedScope, cwd);
    if (scopeError) {
      this.status = { running: false, available: true, message: scopeError };
      return this.getStatus();
    }
    this.port = await freePort();
    const args = buildDifitArgs(selectedScope, this.port);
    // --include-untracked avoids an interactive untracked-files prompt when stdin is ignored.
    const child = (this.launchOptions.spawn ?? spawn)("difit", args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    this.scope = selectedScope;
    let exitCode: number | null = null;
    let exited = false;
    child.once("exit", (code) => {
      exited = true;
      exitCode = code;
      if (this.child === child) this.setStopped(`difit exited${code === null ? "" : ` with code ${code}`}`);
    });
    this.status = { running: true, available: true, pid: child.pid };
    const waitReady = this.launchOptions.waitForHttpReady ?? waitForHttpReady;
    const ready = await waitReady(this.port, READINESS_TIMEOUT_MS, READINESS_POLL_MS, () => !exited);
    if (exited) return this.getStatus();
    if (!ready.ok) {
      await this.stop();
      this.status = { running: false, available: true, message: ready.message };
      return this.getStatus();
    }
    this.status = { running: true, available: true, pid: child.pid, url: reviewUrl(this.port) };
    return this.getStatus();
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    this.scope = undefined;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    this.setStopped();
  }

  async close(): Promise<void> {
    await this.stop();
  }

  private setStopped(message?: string): void {
    this.child = undefined;
    this.scope = undefined;
    this.status = {
      running: false,
      available: this.status.available,
      ...(message ? { message } : {}),
    };
  }
}

function reviewUrl(port: number): string {
  return `http://${REVIEW_HOST}:${port}`;
}

function normalizeScope(scope: unknown): ReviewScope {
  return scope === "staged" || scope === "last-commit" || scope === "branch-vs-main" ? scope : "working-tree";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, REVIEW_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Unable to choose review port"));
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

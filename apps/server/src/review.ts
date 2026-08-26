import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import type { ReviewScope, ReviewStatus } from "@ainide/shared";

export class ReviewManager {
  private child?: ReturnType<typeof spawn>;
  private status: ReviewStatus = { running: false, available: false };
  private port?: number;
  private scope?: ReviewScope;

  constructor(private readonly getCwd: () => string | undefined) {}

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
    if (!isAvailable("difit")) {
      this.status = { running: false, available: false, message: "difit is not installed or is not available on PATH" };
      return this.getStatus();
    }
    this.port = await freePort();
    const args = [reviewTarget(selectedScope), "--no-open", "--host", "127.0.0.1", "--port", String(this.port)];
    const child = spawn("difit", args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    this.scope = selectedScope;
    this.status = { running: true, available: true, pid: child.pid, url: `http://127.0.0.1:${this.port}` };
    const inspect = (chunk: Buffer | string) => {
      const match = String(chunk).match(/https?:\/\/[^\s"']+/);
      if (match) this.status.url = match[0].replace(/[),.]$/, "");
    };
    child.stdout?.on("data", inspect);
    child.stderr?.on("data", inspect);
    child.once("exit", (code) => {
      if (this.child === child) {
        this.child = undefined;
        this.scope = undefined;
        this.status = { running: false, available: true, message: `difit exited${code === null ? "" : ` with code ${code}`}` };
      }
    });
    return this.getStatus();
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    this.status = { running: false, available: this.status.available };
  }

  async close(): Promise<void> {
    await this.stop();
  }
}

function reviewTarget(scope: ReviewScope): string {
  switch (scope) {
    case "staged": return "--staged";
    case "last-commit": return "HEAD~1..HEAD";
    case "branch-vs-main": return "main...HEAD";
    default: return ".";
  }
}

function normalizeScope(scope: unknown): ReviewScope {
  return scope === "staged" || scope === "last-commit" || scope === "branch-vs-main" ? scope : "working-tree";
}

function isAvailable(command: string): boolean {
  return spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Unable to choose review port"));
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReviewManager,
  buildDifitArgs,
  validateReviewScope,
  waitForHttpReady,
} from "./review.js";

describe("buildDifitArgs", () => {
  it("builds working-tree args with --include-untracked", () => {
    expect(buildDifitArgs("working-tree", 3001)).toEqual([
      ".", "--include-untracked", "--no-open", "--host", "127.0.0.1", "--port", "3001",
    ]);
  });

  it("builds staged args", () => {
    expect(buildDifitArgs("staged", 3002)).toEqual([
      "staged", "--no-open", "--host", "127.0.0.1", "--port", "3002",
    ]);
  });

  it("builds last-commit args", () => {
    expect(buildDifitArgs("last-commit", 3003)).toEqual([
      "HEAD~1", "HEAD", "--no-open", "--host", "127.0.0.1", "--port", "3003",
    ]);
  });

  it("builds branch-vs-main args", () => {
    expect(buildDifitArgs("branch-vs-main", 3004)).toEqual([
      "main", "HEAD", "--no-open", "--host", "127.0.0.1", "--port", "3004",
    ]);
  });
});

describe("validateReviewScope", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  it("allows branch-vs-main when main exists", () => {
    expect(validateReviewScope("branch-vs-main", process.cwd())).toBeUndefined();
  });

  it("rejects branch-vs-main when main is missing", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "ainide-review-"));
    spawnSync("git", ["init", "-b", "develop"], { cwd: tempDir, stdio: "ignore" });
    spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: tempDir, stdio: "ignore" });
    expect(validateReviewScope("branch-vs-main", tempDir)).toContain("main branch");
  });
});

describe("waitForHttpReady", () => {
  it("resolves when the port responds with HTTP 200", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200);
      response.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    await expect(waitForHttpReady(port, 2000, 50)).resolves.toEqual({ ok: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("times out when nothing is listening", async () => {
    const result = await waitForHttpReady(31999, 200, 50);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("did not become ready");
  });

  it("stops when the child is no longer alive", async () => {
    const result = await waitForHttpReady(31998, 500, 50, () => false);
    expect(result).toEqual({ ok: false, message: "difit exited before becoming ready" });
  });
});

describe("ReviewManager", () => {
  it("reports a useful state when no workspace is open", async () => {
    const manager = new ReviewManager(() => undefined);
    const status = await manager.start("working-tree");

    expect(status.running).toBe(false);
    expect(status.available).toBe(false);
    expect(status.message).toContain("workspace");
    expect(status.url).toBeUndefined();
    await manager.stop();
  });

  it("reports when difit is not available", async () => {
    const manager = new ReviewManager(() => process.cwd(), { isCommandAvailable: () => false });
    const status = await manager.start("working-tree");

    expect(status.running).toBe(false);
    expect(status.available).toBe(false);
    expect(status.message).toContain("difit");
    expect(status.url).toBeUndefined();
  });

  it("rejects branch-vs-main without a main branch", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ainide-review-"));
    try {
      spawnSync("git", ["init", "-b", "develop"], { cwd: tempDir, stdio: "ignore" });
      spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: tempDir, stdio: "ignore" });
      const manager = new ReviewManager(() => tempDir);
      const status = await manager.start("branch-vs-main");

      expect(status.running).toBe(false);
      expect(status.url).toBeUndefined();
      expect(status.message).toContain("main branch");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("does not return a url when readiness times out", async () => {
    const manager = new ReviewManager(() => process.cwd(), {
      waitForHttpReady: async () => ({ ok: false, message: "Difit did not become ready within 10000ms" }),
      spawn: vi.fn(() => ({
        pid: 4242,
        once: vi.fn(),
        kill: vi.fn(),
        stdout: null,
        stderr: null,
      })) as unknown as typeof import("node:child_process").spawn,
    });
    const status = await manager.start("working-tree", true);

    expect(status.running).toBe(false);
    expect(status.url).toBeUndefined();
    expect(status.message).toContain("did not become ready");
    await manager.stop();
  });

  it("clears url after stop", async () => {
    const manager = new ReviewManager(() => process.cwd(), {
      waitForHttpReady: async () => ({ ok: true }),
      spawn: vi.fn(() => ({
        pid: 4242,
        once: vi.fn(),
        kill: vi.fn(),
        stdout: null,
        stderr: null,
      })) as unknown as typeof import("node:child_process").spawn,
    });

    const started = await manager.start("working-tree", true);
    expect(started.url).toBeDefined();
    await manager.stop();
    expect(manager.getStatus().url).toBeUndefined();
    expect(manager.getStatus().running).toBe(false);
  });

  it("includes scope on running status", async () => {
    const manager = new ReviewManager(() => process.cwd(), {
      waitForHttpReady: async () => ({ ok: true }),
      spawn: vi.fn(() => ({
        pid: 4242,
        once: vi.fn(),
        kill: vi.fn(),
        stdout: null,
        stderr: null,
      })) as unknown as typeof import("node:child_process").spawn,
    });

    await manager.start("staged", true);
    const status = manager.getStatus();
    expect(status.running).toBe(true);
    expect(status.scope).toBe("staged");
    expect(status.url).toBeDefined();
    await manager.stop();
    expect(manager.getStatus().scope).toBeUndefined();
  });

  it("returns existing status when already running for the same scope", async () => {
    const spawnMock = vi.fn(() => ({
      pid: 4242,
      once: vi.fn(),
      kill: vi.fn(),
      stdout: null,
      stderr: null,
    })) as unknown as typeof import("node:child_process").spawn;
    const manager = new ReviewManager(() => process.cwd(), {
      waitForHttpReady: async () => ({ ok: true }),
      spawn: spawnMock,
    });

    const first = await manager.start("staged", true);
    expect(first.url).toBeDefined();
    expect(first.scope).toBe("staged");
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const second = await manager.start("staged", false);
    expect(second.url).toBe(first.url);
    expect(second.scope).toBe("staged");
    expect(spawnMock).toHaveBeenCalledTimes(1);

    await manager.stop();
  });
});

describe("ReviewManager bundled tools", () => {
  it("passes a PATH with the bundled tools dir prepended to the difit child", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ainide-review-tools-"));
    const previousTools = process.env.AINIDE_TOOLS_DIR;
    process.env.AINIDE_TOOLS_DIR = dir;
    try {
      let capturedEnv: NodeJS.ProcessEnv | undefined;
      let capturedCommand: string | undefined;
      const manager = new ReviewManager(() => process.cwd(), {
        isCommandAvailable: () => true,
        waitForHttpReady: async () => ({ ok: true }),
        spawn: vi.fn((_command: string, _args: unknown, options: { env?: NodeJS.ProcessEnv }) => {
          capturedEnv = options?.env;
          capturedCommand = _command;
          return { pid: 4242, once: vi.fn(), kill: vi.fn(), stdout: null, stderr: null };
        }) as unknown as typeof import("node:child_process").spawn,
      });
      await manager.start("working-tree", true);
      expect(capturedCommand).toBe("difit");
      expect(capturedEnv?.PATH).toBe(`${dir}:${process.env.PATH}`);
      await manager.stop();
    } finally {
      if (previousTools === undefined) delete process.env.AINIDE_TOOLS_DIR;
      else process.env.AINIDE_TOOLS_DIR = previousTools;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not modify the difit child PATH when the tools dir is disabled", async () => {
    const previousTools = process.env.AINIDE_TOOLS_DIR;
    process.env.AINIDE_TOOLS_DIR = "";
    try {
      let capturedEnv: NodeJS.ProcessEnv | undefined;
      const manager = new ReviewManager(() => process.cwd(), {
        isCommandAvailable: () => true,
        waitForHttpReady: async () => ({ ok: true }),
        spawn: vi.fn((_command: string, _args: unknown, options: { env?: NodeJS.ProcessEnv }) => {
          capturedEnv = options?.env;
          return { pid: 4242, once: vi.fn(), kill: vi.fn(), stdout: null, stderr: null };
        }) as unknown as typeof import("node:child_process").spawn,
      });
      await manager.start("working-tree", true);
      expect(capturedEnv).toBe(process.env);
      await manager.stop();
    } finally {
      if (previousTools === undefined) delete process.env.AINIDE_TOOLS_DIR;
      else process.env.AINIDE_TOOLS_DIR = previousTools;
    }
  });
});

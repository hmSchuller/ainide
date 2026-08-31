import { mkdtemp, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AcpSession } from "@ainide/shared";
import { AcpTerminalManager } from "./terminals.js";

function session(id: string, rootPath: string): AcpSession {
  return {
    id,
    title: id,
    projectId: rootPath,
    providerId: "test",
    providerLabel: "Test",
    authMethods: [],
    status: "live",
    capabilities: {
      canCancel: true,
      canClose: false,
      canLoad: false,
      canResume: false,
      canSetConfig: false,
      canReadTextFile: true,
      canWriteTextFile: true,
      canUseTerminal: true,
      canRequestPermission: true,
      canElicit: true,
    },
    configOptions: [],
    availableCommands: [],
    pendingRequests: [],
    activePrompt: false,
    resumability: "non_resumable",
  };
}

describe("ACP terminal manager", () => {
  it("runs direct commands, captures bounded output, and reports exit status", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-acp-terminal-"));
    const owner = session("owner", root);
    const terminals = new AcpTerminalManager();
    const created = await terminals.create(owner, {
      sessionId: "provider-session",
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.env.ACP_TEST_VALUE || 'missing')"],
      cwd: root,
      env: [{ name: "ACP_TEST_VALUE", value: "direct-output" }],
      outputByteLimit: 64,
    });

    await expect(terminals.waitForExit(owner, created.terminalId)).resolves.toMatchObject({ exitCode: 0 });
    expect(terminals.output(owner, created.terminalId)).toMatchObject({ output: "direct-output", truncated: false, exitStatus: { exitCode: 0 } });
    await terminals.release(owner, created.terminalId);
    await terminals.close();
  });

  it("enforces terminal ownership and workspace cwd validation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-acp-terminal-root-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "ainide-acp-terminal-outside-"));
    await symlink(outside, path.join(root, "outside"));
    const owner = session("owner", root);
    const other = session("other", root);
    const terminals = new AcpTerminalManager();
    const created = await terminals.create(owner, { sessionId: "provider-session", command: process.execPath, args: ["-e", "setTimeout(() => {}, 1000)"], cwd: root });

    await expect(Promise.resolve().then(() => terminals.output(other, created.terminalId))).rejects.toThrow("does not belong");
    await expect(terminals.create(owner, { sessionId: "provider-session", command: process.execPath, cwd: path.join(root, "outside") })).rejects.toThrow(/outside|Symlink/);
    await terminals.closeSession(owner.id);
  });

  it("does not expand shell syntax and releases active children", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ainide-acp-terminal-direct-"));
    const owner = session("owner", root);
    const terminals = new AcpTerminalManager();
    const created = await terminals.create(owner, {
      sessionId: "provider-session",
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.argv[1])", "$(touch SHOULD_NOT_RUN)"],
      cwd: root,
    });

    await expect(terminals.waitForExit(owner, created.terminalId)).resolves.toMatchObject({ exitCode: 0 });
    expect(terminals.output(owner, created.terminalId).output).toBe("$(touch SHOULD_NOT_RUN)");
    await terminals.release(owner, created.terminalId);

    const killed = await terminals.create(owner, { sessionId: "provider-session", command: process.execPath, args: ["-e", "setTimeout(() => {}, 10000)"], cwd: root });
    terminals.kill(owner, killed.terminalId);
    await expect(terminals.waitForExit(owner, killed.terminalId)).resolves.toMatchObject({ signal: expect.any(String) });
    await terminals.release(owner, killed.terminalId);

    const running = await terminals.create(owner, { sessionId: "provider-session", command: process.execPath, args: ["-e", "setTimeout(() => {}, 10000)"], cwd: root });
    await terminals.closeSession(owner.id);
    await expect(Promise.resolve().then(() => terminals.output(owner, running.terminalId))).rejects.toThrow("does not belong");

    const shutdown = await terminals.create(owner, { sessionId: "provider-session", command: process.execPath, args: ["-e", "setTimeout(() => {}, 10000)"], cwd: root });
    await terminals.close();
    await expect(Promise.resolve().then(() => terminals.output(owner, shutdown.terminalId))).rejects.toThrow("does not belong");
  });
});

import { EventEmitter } from "node:events";
import { chmodSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { missingTerminalKinds } from "@ainide/shared";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { TerminalManager } from "./terminals.js";

async function waitForExit(manager: TerminalManager, id: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!manager.list().find((session) => session.id === id)?.alive) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`session ${id} did not exit within ${timeoutMs}ms`);
}

function fakeSocket(): EventEmitter & { readyState: number; messages: string[]; send: (data: string) => void; close: () => void } {
  const socket = new EventEmitter() as EventEmitter & { readyState: number; messages: string[]; send: (data: string) => void; close: () => void };
  socket.readyState = 1;
  socket.messages = [];
  socket.send = (data) => socket.messages.push(data);
  socket.close = () => {
    socket.readyState = 3;
    socket.emit("close");
  };
  return socket;
}

describe("TerminalManager", () => {
  it("creates a PTY session and cleans it up", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-"));
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const session = manager.create({ kind: "custom", cols: 80, rows: 24 });

    expect(session.id).toBeTruthy();
    expect(session.pid).toBeTypeOf("number");
    expect(session.projectId).toBe(cwd);
    expect(manager.list()).toHaveLength(1);
    expect(manager.remove(session.id)).toBe(true);
    expect(manager.list()).toHaveLength(0);
    manager.close();
  });

  it("stamps projectId and keeps the other project's sessions when one is closed", async () => {
    const first = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-a-"));
    const second = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-b-"));
    let cwd = first;
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const sessionA = manager.create({ kind: "shell", cols: 80, rows: 24 });
    cwd = second;
    const sessionB = manager.create({ kind: "shell", cols: 80, rows: 24 });
    expect(sessionA.projectId).toBe(first);
    expect(sessionB.projectId).toBe(second);
    expect(manager.list(first)).toEqual([expect.objectContaining({ id: sessionA.id })]);
    expect(manager.list(second)).toEqual([expect.objectContaining({ id: sessionB.id })]);
    manager.closeByProject(first);
    expect(manager.list(first)).toHaveLength(0);
    expect(manager.list(second)).toEqual([expect.objectContaining({ id: sessionB.id, alive: true })]);
    manager.close();
  });

  it("leaves a living PTY pid unchanged across switch and after a client disconnect", async () => {
    const first = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-sw-a-"));
    const second = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-sw-b-"));
    let cwd = first;
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const session = manager.create({ kind: "agent", cols: 80, rows: 24 });
    const pid = session.pid;
    expect(pid).toBeTypeOf("number");
    cwd = second;
    manager.create({ kind: "shell", cols: 80, rows: 24 });
    expect(manager.list(first)[0]?.pid).toBe(pid);
    expect(manager.list(first)[0]?.alive).toBe(true);
    const socket = fakeSocket();
    manager.connect(socket as unknown as WebSocket, session.id);
    socket.close();
    expect(manager.list(first)[0]?.alive).toBe(true);
    expect(manager.list(first)[0]?.pid).toBe(pid);
    manager.close();
  });

  it("does not treat an already-alive agent as missing during reconcile", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-rec-"));
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const agent = manager.create({ kind: "agent", cols: 80, rows: 24 });
    const missing = missingTerminalKinds(manager.list(cwd), ["agent", "shell"]);
    expect(missing).toEqual(["shell"]);
    expect(manager.list(cwd).filter((session) => session.kind === "agent")).toHaveLength(1);
    expect(agent.alive).toBe(true);
    manager.close();
  });

  it("keeps same-kind agents as separate sessions when renamed or closed", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-agents-"));
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const first = manager.create({ kind: "agent", title: "Implement", cols: 80, rows: 24 });
    const second = manager.create({ kind: "agent", title: "Plan next task", cols: 80, rows: 24 });

    expect(first.id).not.toBe(second.id);
    expect(manager.list(cwd).map((session) => session.title)).toEqual(["Implement", "Plan next task"]);
    expect(manager.rename(first.id, "Implementation", cwd)?.title).toBe("Implementation");
    expect(manager.list(cwd)).toEqual([expect.objectContaining({ id: first.id, title: "Implementation" }), expect.objectContaining({ id: second.id, title: "Plan next task" })]);
    expect(manager.remove(first.id, cwd)).toBe(true);
    expect(manager.list(cwd)).toEqual([expect.objectContaining({ id: second.id, title: "Plan next task" })]);
    manager.close();
  });

  it("writes terminal input exactly as received and rejects a target after project switch", async () => {
    const first = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-input-a-"));
    const second = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-input-b-"));
    let cwd = first;
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const session = manager.create({ kind: "agent", cols: 80, rows: 24 });
    const live = (manager as unknown as { sessions: Map<string, { process: { write: (data: string) => void } }> }).sessions.get(session.id);
    if (!live) throw new Error("session was not created");
    const write = vi.spyOn(live.process, "write");
    const socket = fakeSocket();
    manager.connect(socket as unknown as WebSocket, session.id);
    socket.emit("message", JSON.stringify({ type: "input", sessionId: session.id, data: "reference text" }));
    expect(write).toHaveBeenCalledWith("reference text");

    cwd = second;
    socket.emit("message", JSON.stringify({ type: "input", sessionId: session.id, data: "stale text" }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(socket.messages.map((message) => JSON.parse(message))).toContainEqual({ type: "error", message: "Terminal session does not belong to the active project" });
    manager.close();
  });

  it("rejects cross-project websocket attachment", async () => {
    const first = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-ws-a-"));
    const second = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-ws-b-"));
    let cwd = first;
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const session = manager.create({ kind: "agent", cols: 80, rows: 24 });
    cwd = second;
    const socket = fakeSocket();
    manager.connect(socket as unknown as WebSocket, session.id);
    expect(socket.messages.map((message) => JSON.parse(message))).toContainEqual({ type: "error", message: "Terminal session does not belong to the active project" });
    manager.close();
  });

  it("runs a build command through the shell in the project root and reports exit", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-build-"));
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const session = manager.create({ kind: "build", title: "Build it", command: "echo build-ok", cols: 80, rows: 24 });

    expect(session.kind).toBe("build");
    expect(session.title).toBe("Build it");
    expect(session.command).toBe("echo build-ok");
    expect(session.cwd).toBe(cwd);
    expect(session.projectId).toBe(cwd);

    const socket = fakeSocket();
    manager.connect(socket as unknown as WebSocket, session.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const messages = socket.messages.map((message) => JSON.parse(message));
    expect(messages).toContainEqual(expect.objectContaining({ type: "output", data: expect.stringContaining("build-ok") }));
    expect(messages).toContainEqual({ type: "attached", sessionId: session.id });
    expect(messages).toContainEqual(expect.objectContaining({ type: "exit", exitCode: 0 }));
    expect(manager.list(cwd)[0]).toMatchObject({ id: session.id, alive: false });
    manager.close();
  });

  it("rejects a build session without a command", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-build-400-"));
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    expect(() => manager.create({ kind: "build", title: "Broken", cols: 80, rows: 24 })).toThrowError(/non-empty command/i);
    expect(() => manager.create({ kind: "build", command: "   ", cols: 80, rows: 24 })).toThrowError(/non-empty command/i);
    expect(manager.list(cwd)).toHaveLength(0);
    manager.close();
  });

  it("allows only one live build per project and rejects a second until the first ends", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-build-one-"));
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const first = manager.create({ kind: "build", title: "First", command: "sleep 30", cols: 80, rows: 24 });
    expect(() => manager.create({ kind: "build", title: "Second", command: "echo nope", cols: 80, rows: 24 })).toThrowError(/already running/i);

    expect(manager.remove(first.id, cwd)).toBe(true);
    await waitForExit(manager, first.id);
    expect(manager.list(cwd).find((session) => session.id === first.id)?.alive).toBe(false);

    const second = manager.create({ kind: "build", title: "Second", command: "echo ok", cols: 80, rows: 24 });
    expect(second.command).toBe("echo ok");
    manager.close();
  });

  it("hands the bundled tools directory to a spawned child's PATH", async () => {
    const toolsDir = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-tools-"));
    const outPath = path.join(toolsDir, "path.out");
    const previousTools = process.env.AINIDE_TOOLS_DIR;
    process.env.AINIDE_TOOLS_DIR = toolsDir;
    try {
      const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-tools-cwd-"));
      const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
      const session = manager.create({ kind: "build", title: "path", command: `printf '%s' "$PATH" > "${outPath}"`, cols: 80, rows: 24 });
      const socket = fakeSocket();
      manager.connect(socket as unknown as WebSocket, session.id);
      await waitForExit(manager, session.id);
      const content = await readFile(outPath, "utf8");
      expect(content).toContain(path.resolve(toolsDir));
      manager.close();
      await rm(cwd, { recursive: true, force: true });
    } finally {
      if (previousTools === undefined) delete process.env.AINIDE_TOOLS_DIR;
      else process.env.AINIDE_TOOLS_DIR = previousTools;
      await rm(toolsDir, { recursive: true, force: true });
    }
  });

  it("treats a bundled lazygit as available and launches it by absolute path", async () => {
    const toolsDir = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-lazygit-"));
    const tool = path.join(toolsDir, "lazygit");
    writeFileSync(tool, "#!/bin/sh\nsleep 30\n");
    chmodSync(tool, 0o755);
    const previousTools = process.env.AINIDE_TOOLS_DIR;
    process.env.AINIDE_TOOLS_DIR = toolsDir;
    try {
      const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-lazygit-cwd-"));
      const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
      const session = manager.create({ kind: "lazygit", cols: 80, rows: 24 });
      expect(session.command).toBe(tool);
      expect(session.alive).toBe(true);
      manager.close();
      await rm(cwd, { recursive: true, force: true });
    } finally {
      if (previousTools === undefined) delete process.env.AINIDE_TOOLS_DIR;
      else process.env.AINIDE_TOOLS_DIR = previousTools;
      await rm(toolsDir, { recursive: true, force: true });
    }
  });

  it("keeps a stopped build session in the list as exited and removes it on a later delete", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-build-keep-"));
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const session = manager.create({ kind: "build", title: "Stop me", command: "sleep 30", cols: 80, rows: 24 });
    expect(manager.remove(session.id, cwd)).toBe(true);
    await waitForExit(manager, session.id);
    expect(manager.list(cwd).map((item) => item.id)).toContain(session.id);
    expect(manager.remove(session.id, cwd)).toBe(true);
    expect(manager.list(cwd)).toHaveLength(0);
    manager.close();
  });
});

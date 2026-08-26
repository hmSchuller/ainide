import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { missingTerminalKinds } from "@ainide/shared";
import { TerminalManager } from "./terminals.js";
import type { WebSocket } from "ws";

function fakeSocket(): EventEmitter & { readyState: number; send: (data: string) => void; close: () => void } {
  const socket = new EventEmitter() as EventEmitter & { readyState: number; send: (data: string) => void; close: () => void };
  socket.readyState = 1;
  socket.send = () => undefined;
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
});

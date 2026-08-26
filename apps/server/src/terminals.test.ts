import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TerminalManager } from "./terminals.js";

describe("TerminalManager", () => {
  it("creates a PTY session and cleans it up", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ainide-pty-"));
    const manager = new TerminalManager(() => cwd, { defaultShell: "/bin/sh" });
    const session = manager.create({ kind: "custom", cols: 80, rows: 24 });

    expect(session.id).toBeTruthy();
    expect(session.pid).toBeTypeOf("number");
    expect(manager.list()).toHaveLength(1);
    expect(manager.remove(session.id)).toBe(true);
    expect(manager.list()).toHaveLength(0);
    manager.close();
  });
});

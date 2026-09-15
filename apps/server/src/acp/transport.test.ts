import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acpTransportSpecFromAgent, openAcpTransport, resolveAcpSpawnArgv } from "./transport.js";

describe("ACP spawn argv", () => {
  it("passes through command and args when no prefix is configured", () => {
    expect(resolveAcpSpawnArgv({ command: "opencode", args: ["acp"] })).toEqual({ command: "opencode", args: ["acp"] });
  });

  it("prepends prefix command and args before the provider command", () => {
    expect(resolveAcpSpawnArgv({
      command: "opencode",
      args: ["acp"],
      prefixCommand: "mise",
      prefixArgs: ["exec", "--"],
    })).toEqual({ command: "mise", args: ["exec", "--", "opencode", "acp"] });
  });

  it("builds transport specs from agent config", () => {
    expect(acpTransportSpecFromAgent({
      command: "agent",
      args: ["acp"],
      prefixCommand: "direnv",
      prefixArgs: ["exec", "."],
      env: { FOO: "bar" },
    }, "/workspace")).toEqual({
      command: "direnv",
      args: ["exec", ".", "agent", "acp"],
      cwd: "/workspace",
      env: { FOO: "bar" },
    });
  });
});

describe("ACP stdio transport", () => {
  it("spawns direct arguments without a shell and reports exit and stderr", async () => {
    const script = await fs.mkdtemp(path.join(os.tmpdir(), "ainide-acp-transport-"));
    const transport = openAcpTransport({
      command: process.execPath,
      args: ["-e", "process.stderr.write('diagnostic'); setTimeout(() => process.exit(7), 5)"],
      cwd: script,
    });
    const exit = await transport.closed;
    expect(exit.code).toBe(7);
    expect(transport.stderr()).toBe("diagnostic");
    await fs.rm(script, { recursive: true, force: true });
  });

  it("captures only the tail of oversized stderr output", async () => {
    const transport = openAcpTransport({
      command: process.execPath,
      args: ["-e", "process.stderr.write('x'.repeat(20000)); process.exit(0)"],
      cwd: process.cwd(),
    });
    await transport.closed;
    expect(transport.stderr()).toHaveLength(16_384);
    expect(transport.stderr()).toMatch(/^x+$/);
  });
});

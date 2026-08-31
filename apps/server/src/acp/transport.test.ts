import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openAcpTransport } from "./transport.js";

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

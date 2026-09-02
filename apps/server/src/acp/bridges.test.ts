import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AcpSession } from "@ainide/shared";
import { describe, expect, it } from "vitest";
import { ProjectRegistry } from "../projects.js";
import { createAcpResourceHandlers } from "./bridges.js";
import { AcpTerminalManager } from "./terminals.js";

function session(projectId: string): AcpSession {
  return {
    id: "acp-session",
    title: "ACP",
    titleSource: "user",
    projectId,
    providerId: "fake",
    providerLabel: "Fake",
    authMethods: [],
    status: "live",
    capabilities: { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true },
    configOptions: [],
    availableCommands: [],
    pendingRequests: [],
    activePrompt: false,
    resumability: "non_resumable",
  };
}

async function project(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await writeFile(path.join(root, "file.txt"), "one\ntwo\nthree\n", "utf8");
  return root;
}

describe("ACP workspace bridges", () => {
  it("uses the owning project manager for absolute reads and atomic writes", async () => {
    const first = await project("ainide-acp-bridge-a-");
    const second = await project("ainide-acp-bridge-b-");
    const registry = new ProjectRegistry();
    const terminals = new AcpTerminalManager();
    try {
      await registry.open(first);
      const firstId = registry.activeId as string;
      const handlers = createAcpResourceHandlers(registry, terminals);
      const firstSession = session(firstId);
      await expect(handlers.readTextFile?.(firstSession, { sessionId: "provider", path: path.join(firstId, "file.txt"), line: 2, limit: 1 })).resolves.toEqual({ content: "two" });
      await handlers.writeTextFile?.(firstSession, { sessionId: "provider", path: path.join(firstId, "written.txt"), content: "written" });
      await expect(readFile(path.join(firstId, "written.txt"), "utf8")).resolves.toBe("written");

      await registry.open(second);
      await expect(handlers.readTextFile?.(firstSession, { sessionId: "provider", path: path.join(firstId, "file.txt") })).resolves.toEqual({ content: "one\ntwo\nthree\n" });
    } finally {
      await terminals.close();
      await registry.closeAll();
    }
  });

  it("rejects path escapes before a bridge handler touches the filesystem", async () => {
    const root = await project("ainide-acp-bridge-root-");
    const outside = await project("ainide-acp-bridge-outside-");
    await mkdir(path.join(outside, "nested"));
    await symlink(outside, path.join(root, "linked"));
    const registry = new ProjectRegistry();
    const terminals = new AcpTerminalManager();
    try {
      await registry.open(root);
      const handlers = createAcpResourceHandlers(registry, terminals);
      const current = session(registry.activeId as string);
      await expect(handlers.readTextFile?.(current, { sessionId: "provider", path: path.join(root, "..", path.basename(outside), "file.txt") })).rejects.toThrow("outside");
      await expect(handlers.writeTextFile?.(current, { sessionId: "provider", path: path.join(root, "linked", "new.txt"), content: "nope" })).rejects.toThrow(/outside|Symlink/);
    } finally {
      await terminals.close();
      await registry.closeAll();
    }
  });
});

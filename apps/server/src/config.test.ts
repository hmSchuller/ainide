import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, parseAcpAgents } from "./config.js";

const originalConfig = process.env.AINIDE_CONFIG;
const originalAgentCommand = process.env.AGENT_COMMAND;
const tempDirectories: string[] = [];

afterEach(async () => {
  if (originalConfig === undefined) delete process.env.AINIDE_CONFIG;
  else process.env.AINIDE_CONFIG = originalConfig;
  if (originalAgentCommand === undefined) delete process.env.AGENT_COMMAND;
  else process.env.AGENT_COMMAND = originalAgentCommand;
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("ACP configuration", () => {
  it("keeps valid providers and drops malformed or duplicate entries", () => {
    expect(parseAcpAgents([
      { id: "cursor", label: " Cursor ", command: "agent", args: ["acp"], env: { API_KEY: "local" } },
      { id: "cursor", label: "Duplicate", command: "agent", args: ["acp"] },
      { id: "broken", label: "Broken", command: "agent", args: ["acp", 4] },
    ])).toEqual([{ id: "cursor", label: "Cursor", command: "agent", args: ["acp"], env: { API_KEY: "local" } }]);
  });

  it("loads ACP providers without changing the PTY command", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ainide-config-"));
    tempDirectories.push(directory);
    const configPath = path.join(directory, "config.json");
    await fs.writeFile(configPath, JSON.stringify({
      agentCommand: "claude",
      acpAgents: [{ id: "opencode", label: "OpenCode", command: "opencode", args: ["acp"] }],
    }));
    process.env.AINIDE_CONFIG = configPath;
    delete process.env.AGENT_COMMAND;

    await expect(loadConfig()).resolves.toEqual({
      agentCommand: "claude",
      acpAgents: [{ id: "opencode", label: "OpenCode", command: "opencode", args: ["acp"] }],
    });
  });
});

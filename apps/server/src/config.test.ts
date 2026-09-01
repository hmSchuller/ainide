import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, parseAcpAgents, parseProjects, saveConfig, type AinideConfig } from "./config.js";

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

async function tempConfigDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ainide-config-"));
  tempDirectories.push(directory);
  return directory;
}

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

describe("project agent settings configuration", () => {
  it("parses a valid projects section into a Map", async () => {
    const directory = await tempConfigDir();
    const configPath = path.join(directory, "config.json");
    await fs.writeFile(configPath, JSON.stringify({
      acpAgents: [{ id: "opencode", label: "OpenCode", command: "opencode", args: ["acp"] }],
      projects: {
        "/Users/me/foo": { disabledAgents: ["gemini"] },
        "/Users/me/bar": { disabledAgents: [] },
      },
    }));
    process.env.AINIDE_CONFIG = configPath;
    delete process.env.AGENT_COMMAND;

    const config = await loadConfig();
    expect(config.projects).toBeInstanceOf(Map);
    expect(config.projects?.get("/Users/me/foo")).toEqual({ disabledAgents: ["gemini"] });
    expect(config.projects?.get("/Users/me/bar")).toEqual({ disabledAgents: [] });
  });

  it("treats an absent projects section as empty", async () => {
    const directory = await tempConfigDir();
    const configPath = path.join(directory, "config.json");
    await fs.writeFile(configPath, JSON.stringify({
      acpAgents: [{ id: "opencode", label: "OpenCode", command: "opencode", args: ["acp"] }],
    }));
    process.env.AINIDE_CONFIG = configPath;
    delete process.env.AGENT_COMMAND;

    const config = await loadConfig();
    expect(config.projects).toBeUndefined();
  });

  it("treats a malformed projects section as empty", async () => {
    for (const malformed of [["/a", "/b"], "not-an-object", 42, null]) {
      const directory = await tempConfigDir();
      const configPath = path.join(directory, "config.json");
      await fs.writeFile(configPath, JSON.stringify({ projects: malformed }));
      process.env.AINIDE_CONFIG = configPath;
      delete process.env.AGENT_COMMAND;
      const config = await loadConfig();
      expect(config.projects).toBeUndefined();
    }
  });

  it("drops malformed project entries but keeps valid ones", () => {
    const parsed = parseProjects({
      "/valid": { disabledAgents: ["gemini"] },
      "/no-array": { disabledAgents: "gemini" },
      "/bad-item": { disabledAgents: ["ok", 4] },
      "/not-object": "gemini",
      "/empty": {},
    });
    expect(parsed).toBeInstanceOf(Map);
    expect(parsed?.get("/valid")).toEqual({ disabledAgents: ["gemini"] });
    expect(parsed?.get("/empty")).toEqual({ disabledAgents: [] });
    expect(parsed?.has("/no-array")).toBe(false);
    expect(parsed?.has("/bad-item")).toBe(false);
    expect(parsed?.has("/not-object")).toBe(false);
  });

  it("rewrites the config file atomically with no leftover temp file", async () => {
    const directory = await tempConfigDir();
    const configPath = path.join(directory, "config.json");
    await fs.writeFile(configPath, JSON.stringify({ agentCommand: "claude" }));
    process.env.AINIDE_CONFIG = configPath;

    const config: AinideConfig = {
      agentCommand: "claude",
      projects: new Map([["/Users/me/foo", { disabledAgents: ["gemini"] }]]),
    };
    await saveConfig(config);

    const onDisk = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
    expect(onDisk.agentCommand).toBe("claude");
    expect(onDisk.projects).toEqual({ "/Users/me/foo": { disabledAgents: ["gemini"] } });
    expect(await fs.readdir(directory)).toEqual(["config.json"]);
  });

  it("round-trips reserved and special-character root paths without dropping entries", async () => {
    const directory = await tempConfigDir();
    const configPath = path.join(directory, "config.json");
    process.env.AINIDE_CONFIG = configPath;

    const config: AinideConfig = {
      projects: new Map([
        ["__proto__", { disabledAgents: ["gemini"] }],
        ["/my proj/ünïcode", { disabledAgents: ["cursor"] }],
      ]),
    };
    await saveConfig(config);

    const reloaded = await loadConfig();
    expect(reloaded.projects?.get("__proto__")).toEqual({ disabledAgents: ["gemini"] });
    expect(reloaded.projects?.get("/my proj/ünïcode")).toEqual({ disabledAgents: ["cursor"] });
    expect(reloaded.projects?.size).toBe(2);
  });
});

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AinideConfig, loadConfig, parseAcpAgents, parseBuildCommands, parseProjects, saveConfig } from "./config.js";

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

  it("parses optional per-agent ACP prefix command and args", () => {
    expect(parseAcpAgents([
      { id: "opencode", label: "OpenCode", command: "opencode", args: ["acp"], prefixCommand: "mise", prefixArgs: ["exec", "--"] },
      { id: "plain", label: "Plain", command: "agent", args: ["acp"] },
      { id: "prefix-only", label: "Prefix only", command: "agent", args: ["acp"], prefixCommand: "direnv", prefixArgs: [] },
      { id: "args-without-prefix", label: "Bad", command: "agent", args: ["acp"], prefixArgs: ["exec", "--"] },
    ])).toEqual([
      { id: "opencode", label: "OpenCode", command: "opencode", args: ["acp"], prefixCommand: "mise", prefixArgs: ["exec", "--"] },
      { id: "plain", label: "Plain", command: "agent", args: ["acp"] },
      { id: "prefix-only", label: "Prefix only", command: "agent", args: ["acp"], prefixCommand: "direnv" },
    ]);
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
    expect(config.projects?.get("/Users/me/foo")).toEqual({ disabledAgents: ["gemini"], buildCommands: [] });
    expect(config.projects?.get("/Users/me/bar")).toEqual({ disabledAgents: [], buildCommands: [] });
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
    expect(parsed?.get("/valid")).toEqual({ disabledAgents: ["gemini"], buildCommands: [] });
    expect(parsed?.get("/empty")).toEqual({ disabledAgents: [], buildCommands: [] });
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
      projects: new Map([["/Users/me/foo", { disabledAgents: ["gemini"], buildCommands: [] }]]),
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
        ["__proto__", { disabledAgents: ["gemini"], buildCommands: [] }],
        ["/my proj/ünïcode", { disabledAgents: ["cursor"], buildCommands: [] }],
      ]),
    };
    await saveConfig(config);

    const reloaded = await loadConfig();
    expect(reloaded.projects?.get("__proto__")).toEqual({ disabledAgents: ["gemini"], buildCommands: [] });
    expect(reloaded.projects?.get("/my proj/ünïcode")).toEqual({ disabledAgents: ["cursor"], buildCommands: [] });
    expect(reloaded.projects?.size).toBe(2);
  });
});

describe("build commands configuration", () => {
  it("trims and validates build command entries at load time", () => {
    expect(parseBuildCommands([{ label: " Build ", command: " npm run build " }])).toEqual([{ label: "Build", command: "npm run build" }]);
    expect(parseBuildCommands([{ label: "Build", command: "x" }, { label: "Test", command: "y" }])).toHaveLength(2);
    expect(parseBuildCommands([{ label: "Build", command: "" }])).toBeUndefined();
    expect(parseBuildCommands([{ label: "", command: "x" }])).toBeUndefined();
    expect(parseBuildCommands([{ label: "Build" }])).toBeUndefined();
    expect(parseBuildCommands([{ label: "B", command: "c", extra: true }])).toEqual([{ label: "B", command: "c" }]);
    expect(parseBuildCommands([{ label: "x".repeat(81), command: "y" }])).toBeUndefined();
    expect(parseBuildCommands([{ label: "x", command: "y".repeat(501) }])).toBeUndefined();
    expect(parseBuildCommands([{ label: "x", command: "y".repeat(500) }])).toEqual([{ label: "x", command: "y".repeat(500) }]);
    expect(parseBuildCommands("not-an-array")).toBeUndefined();
    expect(parseBuildCommands([{ label: "x", command: "y", nested: { z: 1 } }])).toEqual([{ label: "x", command: "y" }]);
  });

  it("rejects lists over the entry limit", () => {
    const twenty = Array.from({ length: 20 }, (_, index) => ({ label: `Command ${index}`, command: "echo hi" }));
    expect(parseBuildCommands(twenty)).toHaveLength(20);
    twenty.push({ label: "Extra", command: "echo hi" });
    expect(parseBuildCommands(twenty)).toBeUndefined();
  });

  it("round-trips build commands for a root path with spaces, non-ASCII, and __proto__", async () => {
    const directory = await tempConfigDir();
    const configPath = path.join(directory, "config.json");
    process.env.AINIDE_CONFIG = configPath;

    const commands = [
      { label: "Build", command: "npm run build" },
      { label: "Ünïcode テ", command: "npm test" },
    ];
    const config: AinideConfig = {
      projects: new Map([
        ["__proto__", { disabledAgents: ["gemini"], buildCommands: commands }],
        ["/my proj/ünïcode", { disabledAgents: [], buildCommands: [{ label: "Lint", command: "npm run lint" }] }],
      ]),
    };
    await saveConfig(config);

    const onDisk = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
    expect((Object.getOwnPropertyDescriptor(onDisk.projects, "__proto__")?.value as { buildCommands?: unknown } | undefined)?.buildCommands).toEqual(commands);
    expect((onDisk.projects as Record<string, { buildCommands: unknown }>)["/my proj/ünïcode"]?.buildCommands).toEqual([{ label: "Lint", command: "npm run lint" }]);

    const reloaded = await loadConfig();
    expect(reloaded.projects?.get("__proto__")).toEqual({ disabledAgents: ["gemini"], buildCommands: commands });
    expect(reloaded.projects?.get("/my proj/ünïcode")).toEqual({ disabledAgents: [], buildCommands: [{ label: "Lint", command: "npm run lint" }] });
    expect(reloaded.projects?.size).toBe(2);
  });

  it("loads a config without buildCommands as an empty list and saves without corrupting existing fields", async () => {
    const directory = await tempConfigDir();
    const configPath = path.join(directory, "config.json");
    await fs.writeFile(configPath, JSON.stringify({
      projects: {
        "/Users/me/foo": { disabledAgents: ["gemini"] },
        "/Users/me/bar": { buildCommands: [{ label: "Build", command: "make" }] },
      },
    }));
    process.env.AINIDE_CONFIG = configPath;

    const loaded = await loadConfig();
    expect(loaded.projects?.get("/Users/me/foo")).toEqual({ disabledAgents: ["gemini"], buildCommands: [] });
    expect(loaded.projects?.get("/Users/me/bar")).toEqual({ disabledAgents: [], buildCommands: [{ label: "Build", command: "make" }] });

    await saveConfig(loaded);

    const onDisk = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
    const projects = onDisk.projects as Record<string, Record<string, unknown>>;
    expect(projects["/Users/me/foo"]).toEqual({ disabledAgents: ["gemini"] });
    expect(projects["/Users/me/bar"]).toEqual({ disabledAgents: [], buildCommands: [{ label: "Build", command: "make" }] });
  });

  it("drops a malformed buildCommands field but keeps the rest of the project entry", async () => {
    const directory = await tempConfigDir();
    const configPath = path.join(directory, "config.json");
    await fs.writeFile(configPath, JSON.stringify({
      projects: {
        "/Users/me/foo": { disabledAgents: ["gemini"], buildCommands: [{ label: "Broken" }] },
        "/Users/me/bar": { disabledAgents: [], buildCommands: "nope" },
        "/Users/me/baz": { disabledAgents: [], buildCommands: Array.from({ length: 21 }, (_, index) => ({ label: `L${index}`, command: "c" })) },
      },
    }));
    process.env.AINIDE_CONFIG = configPath;

    const loaded = await loadConfig();
    expect(loaded.projects?.get("/Users/me/foo")).toEqual({ disabledAgents: ["gemini"], buildCommands: [] });
    expect(loaded.projects?.get("/Users/me/bar")).toEqual({ disabledAgents: [], buildCommands: [] });
    expect(loaded.projects?.get("/Users/me/baz")).toEqual({ disabledAgents: [], buildCommands: [] });
  });
});

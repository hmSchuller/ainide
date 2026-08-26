import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AinideConfig {
  agentCommand?: string;
  defaultShell?: string;
  reviewTool?: "difit";
}

export function configFilePath(): string {
  return process.env.AINIDE_CONFIG ?? path.join(os.homedir(), ".config", "ainide", "config.json");
}

export function sessionsFilePath(): string {
  return process.env.AINIDE_SESSIONS ?? path.join(path.dirname(configFilePath()), "sessions.json");
}

/** Local-only settings are intentionally read once when the server starts. */
export async function loadConfig(): Promise<AinideConfig> {
  const configPath = configFilePath();
  let fileConfig: AinideConfig = {};
  try {
    const value: unknown = JSON.parse(await fs.readFile(configPath, "utf8"));
    if (value && typeof value === "object") fileConfig = value as AinideConfig;
  } catch {
    // A missing config is the normal first-run state.
  }
  return {
    ...fileConfig,
    ...(process.env.AGENT_COMMAND ? { agentCommand: process.env.AGENT_COMMAND } : {}),
    ...(process.env.DEFAULT_SHELL ? { defaultShell: process.env.DEFAULT_SHELL } : {}),
  };
}

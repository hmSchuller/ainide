import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AcpAgentConfig {
  id: string;
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ProjectAgentConfig {
  disabledAgents: string[];
}

export interface AinideConfig {
  agentCommand?: string;
  defaultShell?: string;
  reviewTool?: "difit";
  acpAgents?: AcpAgentConfig[];
  projects?: Map<string, ProjectAgentConfig>;
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
  let fileConfig: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(await fs.readFile(configPath, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) fileConfig = value as Record<string, unknown>;
  } catch {
    // A missing config is the normal first-run state.
  }
  const config: AinideConfig = {
    ...(typeof fileConfig.agentCommand === "string" ? { agentCommand: fileConfig.agentCommand } : {}),
    ...(typeof fileConfig.defaultShell === "string" ? { defaultShell: fileConfig.defaultShell } : {}),
    ...(fileConfig.reviewTool === "difit" ? { reviewTool: fileConfig.reviewTool } : {}),
    ...(parseAcpAgents(fileConfig.acpAgents) ? { acpAgents: parseAcpAgents(fileConfig.acpAgents) } : {}),
    ...(parseProjects(fileConfig.projects) ? { projects: parseProjects(fileConfig.projects) } : {}),
  };
  return {
    ...config,
    ...(process.env.AGENT_COMMAND ? { agentCommand: process.env.AGENT_COMMAND } : {}),
    ...(process.env.DEFAULT_SHELL ? { defaultShell: process.env.DEFAULT_SHELL } : {}),
  };
}

/**
 * Persists the in-memory configuration atomically: the serialized config is
 * written to a temp file in the same directory, then renamed over the config
 * file, so a crash never leaves a truncated config behind.
 */
export async function saveConfig(config: AinideConfig): Promise<void> {
  const configPath = configFilePath();
  const directory = path.dirname(configPath);
  const tempPath = path.join(directory, `${path.basename(configPath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(serializeConfig(config), null, 2)}\n`, "utf8");
  try {
    await fs.rename(tempPath, configPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function serializeConfig(config: AinideConfig): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  if (config.agentCommand !== undefined) serialized.agentCommand = config.agentCommand;
  if (config.defaultShell !== undefined) serialized.defaultShell = config.defaultShell;
  if (config.reviewTool !== undefined) serialized.reviewTool = config.reviewTool;
  if (config.acpAgents) serialized.acpAgents = config.acpAgents;
  if (config.projects && config.projects.size) {
    // Object.fromEntries uses define-property semantics, so reserved keys such
    // as "__proto__" become own properties and survive JSON.stringify.
    serialized.projects = Object.fromEntries(
      [...config.projects.entries()].map(([rootPath, entry]) => [rootPath, { disabledAgents: [...entry.disabledAgents] }]),
    );
  }
  return serialized;
}

export function parseAcpAgents(value: unknown): AcpAgentConfig[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const agents = value.flatMap((item): AcpAgentConfig[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const id = cleanConfigText(record.id, 80);
    const label = cleanConfigText(record.label, 80);
    const command = cleanConfigText(record.command, 500);
    const args = parseStringArray(record.args);
    if (!id || !label || !command || !args || ids.has(id)) return [];
    const env = parseEnvironment(record.env);
    if (record.env !== undefined && !env) return [];
    ids.add(id);
    return [{ id, label, command, args, ...(env ? { env } : {}) }];
  });
  return agents.length ? agents : undefined;
}

export function parseProjects(value: unknown): Map<string, ProjectAgentConfig> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const projects = new Map<string, ProjectAgentConfig>();
  for (const [rootPath, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!rootPath || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (record.disabledAgents === undefined) {
      projects.set(rootPath, { disabledAgents: [] });
      continue;
    }
    const disabled = parseStringArray(record.disabledAgents);
    if (!disabled) continue;
    projects.set(rootPath, { disabledAgents: disabled });
  }
  return projects.size ? projects : undefined;
}

function cleanConfigText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean && clean.length <= maxLength ? clean : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value.map((item) => item.trim()).filter(Boolean);
}

function parseEnvironment(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([key, nested]) => !key || typeof nested !== "string")) return undefined;
  const environment: Record<string, string> = {};
  for (const [key, nested] of entries) environment[key] = nested as string;
  return environment;
}

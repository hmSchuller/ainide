import { promises as fs } from "node:fs";
import path from "node:path";
import { type ProjectSessionSnapshot, parseAcpProviderPreferences, parseAcpSessionDescriptors, parseAgentSessionDescriptors, parseAppMode, type SessionSnapshot, type TerminalKind } from "@ainide/shared";
import { sessionsFilePath } from "./config.js";

const SESSION_VERSION = 1;
const TERMINAL_KINDS = new Set<TerminalKind>(["agent", "shell", "lazygit", "custom"]);

export async function loadSessionSnapshot(filePath = sessionsFilePath()): Promise<SessionSnapshot | undefined> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    return parseSessionSnapshot(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function saveSessionSnapshot(snapshot: SessionSnapshot, filePath = sessionsFilePath()): Promise<void> {
  const sanitized = stripSecrets(sanitizeSnapshot(snapshot)) as SessionSnapshot;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
}

export function parseSessionSnapshot(value: unknown): SessionSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const projects = Array.isArray(record.projects) ? record.projects.flatMap((item) => {
    const project = parseProjectSnapshot(item);
    return project ? [project] : [];
  }) : [];
  const activeRootPath = typeof record.activeRootPath === "string" && record.activeRootPath ? record.activeRootPath : undefined;
  const acpProviderPreferences = parseAcpProviderPreferences(record.acpProviderPreferences);
  return {
    version: typeof record.version === "number" && Number.isFinite(record.version) ? record.version : SESSION_VERSION,
    ...(activeRootPath ? { activeRootPath } : {}),
    ...(acpProviderPreferences ? { acpProviderPreferences } : {}),
    projects,
  };
}

export function sanitizeSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  const acpProviderPreferences = parseAcpProviderPreferences(snapshot.acpProviderPreferences);
  return {
    version: SESSION_VERSION,
    ...(snapshot.activeRootPath ? { activeRootPath: snapshot.activeRootPath } : {}),
    ...(acpProviderPreferences ? { acpProviderPreferences } : {}),
    projects: snapshot.projects.map((project) => {
      const agentSessions = parseAgentSessionDescriptors(project.agentSessions);
      const acpSessions = parseAcpSessionDescriptors(project.acpSessions);
      return {
        rootPath: project.rootPath,
        name: project.name,
        openFilePaths: [...project.openFilePaths],
        panes: {
          primary: { tabPaths: [...project.panes.primary.tabPaths], ...(project.panes.primary.activePath ? { activePath: project.panes.primary.activePath } : {}) },
          secondary: { tabPaths: [...project.panes.secondary.tabPaths], ...(project.panes.secondary.activePath ? { activePath: project.panes.secondary.activePath } : {}) },
        },
        secondaryOpen: project.secondaryOpen,
        expandedPaths: [...project.expandedPaths],
        mode: parseAppMode(project.mode),
        terminalKinds: project.terminalKinds.filter((kind) => TERMINAL_KINDS.has(kind)),
        ...(agentSessions ? { agentSessions } : {}),
        ...(acpSessions ? { acpSessions } : {}),
      };
    }),
  };
}

function parseProjectSnapshot(value: unknown): ProjectSessionSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.rootPath !== "string" || !record.rootPath) return undefined;
  const panes = parsePanes(record.panes);
  const terminalKinds = Array.isArray(record.terminalKinds)
    ? record.terminalKinds.filter((kind): kind is TerminalKind => typeof kind === "string" && TERMINAL_KINDS.has(kind as TerminalKind))
    : [];
  const agentSessions = parseAgentSessionDescriptors(record.agentSessions);
  const acpSessions = parseAcpSessionDescriptors(record.acpSessions);
  return {
    rootPath: record.rootPath,
    name: typeof record.name === "string" && record.name ? record.name : path.basename(record.rootPath) || record.rootPath,
    openFilePaths: stringArray(record.openFilePaths),
    panes,
    secondaryOpen: record.secondaryOpen === true,
    expandedPaths: stringArray(record.expandedPaths),
    mode: parseAppMode(record.mode),
    terminalKinds,
    ...(agentSessions ? { agentSessions } : {}),
    ...(acpSessions ? { acpSessions } : {}),
  };
}

function parsePanes(value: unknown): ProjectSessionSnapshot["panes"] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    primary: parsePane(record.primary),
    secondary: parsePane(record.secondary),
  };
}

function parsePane(value: unknown): ProjectSessionSnapshot["panes"]["primary"] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const tabPaths = stringArray(record.tabPaths);
  const activePath = typeof record.activePath === "string" ? record.activePath : undefined;
  return { tabPaths, ...(activePath ? { activePath } : {}) };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === "acpProviderPreferences") {
        result[key] = nested;
        continue;
      }
      if (["token", "tokens", "sessionToken", "content", "ptyId", "ptyID", "processId", "pid", "scrollback", "command", "commands", "referenceKit", "referenceKits"].includes(key)) continue;
      result[key] = stripSecrets(nested);
    }
    return result;
  }
  return value;
}

export type GitFileStatusKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface Workspace {
  rootPath: string;
  name: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  gitStatus?: GitFileStatusKind;
  recent?: boolean;
}

export interface WorkspaceDirectoryChild {
  name: string;
  path: string;
}

export interface WorkspaceDirectoryChildrenResponse {
  currentPath: string;
  parentPath: string;
  homePath: string;
  children: WorkspaceDirectoryChild[];
}

export interface GitFileStatus {
  path: string;
  status: GitFileStatusKind;
  previousPath?: string;
}

export interface GitStatus {
  branch?: string;
  head?: string;
  dirty: boolean;
  isRepository: boolean;
  files: GitFileStatus[];
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

export type GitBaselineKind = "head" | "empty" | "unavailable";

export type GitBaselineUnavailableReason =
  | "non-repository"
  | "no-head"
  | "binary"
  | "conflict"
  | "unknown";

export interface GitFileComparison {
  path: string;
  previousPath?: string;
  status: GitFileStatusKind | "clean";
  baseline: GitBaselineKind;
  unavailableReason?: GitBaselineUnavailableReason;
  head?: string;
  branch?: string;
  isRepository: boolean;
  content?: string;
}

export type TerminalKind = "agent" | "shell" | "lazygit" | "custom" | "build";

export interface BuildCommand {
  label: string;
  command: string;
}

export interface ProjectBuildCommands {
  commands: BuildCommand[];
}

export interface ProjectBuildCommandsUpdate {
  rootPath: string;
  commands: BuildCommand[];
}

export interface TerminalSession {
  id: string;
  title: string;
  command: string;
  cwd: string;
  pid?: number;
  alive: boolean;
  kind: TerminalKind;
  projectId: string;
}

export interface AgentSessionDescriptor {
  title: string;
}

export type AcpTitleSource = "provider" | "user";

export interface AcpSessionDescriptor {
  id: string;
  title: string;
  providerId: string;
  acpSessionId: string;
  resumability: "resumable" | "non_resumable";
  titleSource: AcpTitleSource;
}

export type AcpProviderPreferenceValue = string | boolean;

export interface AcpProviderPreference {
  providerId: string;
  values: Record<string, AcpProviderPreferenceValue>;
}

export interface AcpProviderDescriptor {
  id: string;
  label: string;
}

export interface ProjectAgentSettings {
  all: AcpProviderDescriptor[];
  disabled: string[];
}

export interface ProjectAgentSettingsUpdate {
  rootPath: string;
  disabledAgents: string[];
}

export interface AcpAuthMethod {
  id: string;
  label: string;
  type: "agent" | "terminal";
  description?: string;
}

export type AcpSessionStatus =
  | "connecting"
  | "auth_required"
  | "live"
  | "waiting"
  | "disconnected"
  | "exited"
  | "failed"
  | "non_resumable";

export interface AcpSessionCapabilities {
  canCancel: boolean;
  canClose: boolean;
  canLoad: boolean;
  canList: boolean;
  canResume: boolean;
  canSetConfig: boolean;
  canReadTextFile: boolean;
  canWriteTextFile: boolean;
  canUseTerminal: boolean;
  canRequestPermission: boolean;
  canElicit: boolean;
}

export interface AcpProviderSessionSummary {
  sessionId: string;
  title?: string;
  updatedAt?: string;
}

export interface AcpProviderSessionsResult {
  available: boolean;
  sessions: AcpProviderSessionSummary[];
}

export interface AcpSessionCreateRequest {
  providerId: string;
  title?: string;
  acpSessionId?: string;
}

export interface AcpConfigOptionChoice {
  value: string;
  label: string;
}

export interface AcpConfigOption {
  id: string;
  label: string;
  type: "select" | "boolean";
  category?: string;
  currentValue?: string | boolean;
  choices?: AcpConfigOptionChoice[];
}

export interface AcpCommand {
  name: string;
  description: string;
  inputHint?: string;
}

export interface AcpPermissionOption {
  id: string;
  label: string;
  kind?: string;
}

export interface AcpPermissionRequest {
  requestId: string;
  title: string;
  description?: string;
  options: AcpPermissionOption[];
}

export interface AcpElicitationField {
  id: string;
  label: string;
  type: "text" | "number" | "boolean" | "select";
  required?: boolean;
  choices?: AcpConfigOptionChoice[];
}

export interface AcpElicitationRequest {
  requestId: string;
  title: string;
  description?: string;
  fields: AcpElicitationField[];
}

export type AcpPendingRequest =
  | { type: "permission"; request: AcpPermissionRequest }
  | { type: "elicitation"; request: AcpElicitationRequest };

export interface AcpSession {
  id: string;
  title: string;
  titleSource: AcpTitleSource;
  projectId: string;
  providerId: string;
  providerLabel: string;
  acpSessionId?: string;
  authMethods: AcpAuthMethod[];
  status: AcpSessionStatus;
  capabilities: AcpSessionCapabilities;
  configOptions: AcpConfigOption[];
  availableCommands: AcpCommand[];
  pendingRequests: AcpPendingRequest[];
  /** Provider-reported subordinate activity; never a separate ainide session. */
  subagents?: AcpSubagent[];
  activePrompt: boolean;
  resumability: "unknown" | "resumable" | "non_resumable" | "restored";
  error?: string;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type AcpSubagentState = "starting" | "working" | "running" | "completed" | "failed" | "cancelled" | "unknown";

/** A provider-owned subordinate activity item. It is never an ainide session. */
export interface AcpSubagent {
  /** Provider identity is mandatory; ainide never derives it from activity text. */
  providerId: string;
  id: string;
  name?: string;
  role?: string;
  activity?: string;
  state?: AcpSubagentState;
}

export type AcpActivity =
  | { type: "message"; id: string; role: "user" | "agent"; text: string; format?: "plain" | "markdown"; thought?: boolean }
  | { type: "tool_call"; id: string; title: string; status: "running" | "completed" | "failed" | "cancelled"; input?: string; output?: string }
  | { type: "plan"; id: string; text: string; status?: "pending" | "running" | "completed" | "failed" }
  | { type: "location"; path: string; line?: number; column?: number }
  | { type: "diff"; id: string; path?: string; diff: string }
  | { type: "terminal"; id: string; output?: string; status?: "running" | "exited" | "failed"; exitCode?: number | null }
  | { type: "usage"; inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { type: "turn"; status: "completed" | "failed" | "cancelled"; message?: string }
  | { type: "unknown"; name: string; data: JsonValue };

export type AcpSessionEvent =
  | { type: "status"; session: AcpSession }
  | { type: "activity"; sessionId: string; activity: AcpActivity }
  | { type: "subagent"; sessionId: string; subagent: AcpSubagent }
  | { type: "config"; sessionId: string; options: AcpConfigOption[] }
  | { type: "request"; sessionId: string; request: AcpPendingRequest }
  | { type: "request_resolved"; sessionId: string; requestId: string };

export type AcpServerEvent =
  | { type: "snapshot"; projectId: string; sessions: AcpSession[]; history: Record<string, AcpActivity[]>; sequence: number; sequences?: Record<string, number> }
  | { type: "session_event"; projectId: string; sessionId: string; sequence: number; event: AcpSessionEvent }
  | { type: "session_removed"; projectId: string; sessionId: string; sequence: number };

export interface AcpPromptContext {
  path: string;
  content: string;
  language?: string;
  startLine?: number;
  endLine?: number;
}

export interface AcpPromptRequest {
  text: string;
  context?: AcpPromptContext[];
}

export type AcpElicitationValue = string | number | boolean | string[];

export type AcpRequestResponse =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" }
  | { action: "accept"; content?: Record<string, AcpElicitationValue> }
  | { action: "decline" | "cancel" };

export interface AcpSessionDetail {
  session: AcpSession;
  history: AcpActivity[];
  subagents?: AcpSubagent[];
}

export type TerminalClientMessage =
  | { type: "input"; sessionId: string; data: string }
  | { type: "resize"; sessionId: string; cols: number; rows: number }
  | { type: "attach"; sessionId: string };

export type TerminalServerMessage =
  | { type: "output"; sessionId: string; data: string }
  | { type: "exit"; sessionId: string; exitCode: number | null }
  | { type: "attached"; sessionId: string };

export interface RecentChange {
  path: string;
  type: "changed" | "created" | "deleted";
  timestamp: number;
}

export type WorkspaceEvent =
  | { type: "file_changed"; projectId: string; path: string; change: RecentChange["type"] }
  | { type: "git_changed"; projectId: string; status: GitStatus }
  | { type: "workspace_changed"; projectId: string };

export interface ProjectRef {
  projectId: string;
  rootPath: string;
  name: string;
}

export interface PaneSnapshot {
  tabPaths: string[];
  activePath?: string;
}

export interface ProjectSessionSnapshot {
  rootPath: string;
  name: string;
  openFilePaths: string[];
  panes: {
    primary: PaneSnapshot;
    secondary: PaneSnapshot;
  };
  secondaryOpen: boolean;
  expandedPaths: string[];
  mode: AppMode;
  terminalKinds: TerminalKind[];
  agentSessions?: AgentSessionDescriptor[];
  acpSessions?: AcpSessionDescriptor[];
}

export interface SessionSnapshot {
  version: number;
  activeRootPath?: string;
  projects: ProjectSessionSnapshot[];
  acpProviderPreferences?: AcpProviderPreference[];
}

export interface SessionBootstrap {
  token: string;
  openProjects: ProjectRef[];
  knownProjects: ProjectRef[];
  activeProjectId: string | null;
  workspace: Workspace | null;
  snapshot?: ProjectSessionSnapshot;
  acpSessions?: AcpSession[];
  restoreError?: string;
}

export type AppMode = "edit" | "review" | "agents" | "lazygit";

export const APP_MODES: readonly AppMode[] = ["edit", "review", "agents", "lazygit"];

export function parseAppMode(value: unknown): AppMode {
  if (value === "review" || value === "agents" || value === "lazygit") return value;
  return "edit";
}

export interface ReviewStatus {
  running: boolean;
  available: boolean;
  url?: string;
  pid?: number;
  scope?: ReviewScope;
  message?: string;
}

export type ReviewScope = "working-tree" | "staged" | "last-commit" | "branch-vs-main";

export type FileCreateType = "file" | "directory";

export interface FileRenameRequest {
  from: string;
  to: string;
}

export interface FileCreateRequest {
  path: string;
  type: FileCreateType;
}

export const DEFAULT_TERMINAL_KINDS: TerminalKind[] = ["shell", "lazygit"];

export { DEFAULT_BACKEND_PORT, resolveBackendPort } from "./port.js";
export { compareVersions, isNewerRelease, type VersionInfo } from "./version.js";

export function missingTerminalKinds(
  sessions: Array<{ kind: TerminalKind; alive: boolean }>,
  wanted: TerminalKind[] = DEFAULT_TERMINAL_KINDS,
): TerminalKind[] {
  const living = new Set(sessions.filter((session) => session.alive).map((session) => session.kind));
  return wanted.filter((kind) => !living.has(kind));
}

export function parseAgentSessionDescriptors(value: unknown): AgentSessionDescriptor[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const title = (item as Record<string, unknown>).title;
    if (typeof title !== "string") return [];
    const cleanTitle = title.trim();
    return cleanTitle && cleanTitle.length <= 80 ? [{ title: cleanTitle }] : [];
  });
}

export function parseAcpSessionDescriptors(value: unknown): AcpSessionDescriptor[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = cleanDescriptorValue(record.id);
    const title = cleanDescriptorValue(record.title);
    const providerId = cleanDescriptorValue(record.providerId);
    const acpSessionId = cleanDescriptorValue(record.acpSessionId);
    const resumability = record.resumability === "resumable" || record.resumability === "non_resumable" ? record.resumability : undefined;
    if (!id || !title || !providerId || !acpSessionId || !resumability) return [];
    const titleSource = record.titleSource === "provider" ? "provider" : "user";
    return [{ id, title, providerId, acpSessionId, resumability, titleSource }];
  });
}

export function parseAcpProviderPreferences(value: unknown): AcpProviderPreference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const providerIds = new Set<string>();
  const preferences = value.flatMap((item): AcpProviderPreference[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const providerId = cleanDescriptorValue(record.providerId);
    const values = record.values;
    if (!providerId || providerIds.has(providerId) || !values || typeof values !== "object" || Array.isArray(values)) return [];
    const entries = Object.entries(values);
    if (!entries.length || entries.length > 100) return [];
    const optionIds = new Set<string>();
    const parsed = entries.flatMap(([key, value]): Array<[string, AcpProviderPreferenceValue]> => {
      const optionId = cleanDescriptorValue(key);
      if (!optionId || optionIds.has(optionId) || isSensitivePreferenceKey(optionId) || (typeof value !== "string" && typeof value !== "boolean") || (typeof value === "string" && value.length > 500)) return [];
      optionIds.add(optionId);
      return [[optionId, value]];
    });
    if (parsed.length !== entries.length) return [];
    providerIds.add(providerId);
    return [{ providerId, values: Object.fromEntries(parsed) }];
  });
  return preferences.length ? preferences : undefined;
}

function cleanDescriptorValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean && clean.length <= 200 ? clean : undefined;
}

function isSensitivePreferenceKey(value: string): boolean {
  return /(^|[-_.])(token|secret|password|api[-_]?key|authorization|credential)(?:$|[-_.])/i.test(value);
}

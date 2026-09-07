import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AcpPromptContext, AcpPromptRequest, ProjectSessionSnapshot, SessionBootstrap, WorkspaceEvent } from "@ainide/shared";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { createAcpResourceHandlers } from "./acp/bridges.js";
import { type AcpRequestResponse, AcpSessionError, AcpSessionManager } from "./acp/manager.js";
import { AcpTerminalManager } from "./acp/terminals.js";
import { loadConfig, parseBuildCommands, saveConfig } from "./config.js";
import { listDirectoryChildren } from "./directory-picker.js";
import { ProjectRegistry } from "./projects.js";
import { ReviewManager } from "./review.js";
import { loadSessionSnapshot, saveSessionSnapshot } from "./sessions.js";
import { TerminalError, TerminalManager } from "./terminals.js";
import { resolveLocalVersion } from "./version.js";
import { WorkspaceManager } from "./workspace.js";

export interface CreateServerOptions {
  update?: { current?: string; latest?: string; notesUrl?: string };
  acpListTimeoutMs?: number;
}

export interface AinideServer {
  app: FastifyInstance;
  token: string;
  projects: ProjectRegistry;
  terminals: TerminalManager;
  acp: AcpSessionManager;
  review: ReviewManager;
  restoreError?: string;
  close: () => Promise<void>;
}

function requestToken(request: FastifyRequest): string | undefined {
  const header = request.headers["x-session-token"];
  if (typeof header === "string") return header;
  const query = request.query as { token?: unknown };
  return typeof query?.token === "string" ? query.token : undefined;
}

function tokenGuard(token: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const pathname = request.url.split("?", 1)[0];
    if (pathname === "/api/session") return;
    const isApi = pathname.startsWith("/api/");
    const isWebSocket = pathname === "/events" || pathname === "/terminal" || pathname === "/acp-events";
    if (!isApi && !isWebSocket) return;
    const authorized = isWebSocket ? requestToken(request) === token : request.headers["x-session-token"] === token;
    if (!authorized) {
      await reply.code(401).send({ error: "A valid x-session-token is required" });
    }
  };
}

function body(request: FastifyRequest): Record<string, unknown> {
  return (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
}

function queryPath(request: FastifyRequest): string {
  const value = (request.query as { path?: unknown }).path;
  return typeof value === "string" ? value : "";
}

function errorReply(reply: FastifyReply, error: unknown): void {
  if (error instanceof TerminalError || error instanceof AcpSessionError) {
    void reply.code(error.statusCode).send({ error: error.message });
  } else {
    void reply.code(400).send({ error: error instanceof Error ? error.message : "Request failed" });
  }
}

function snapshotPatchFrom(value: unknown): Partial<ProjectSessionSnapshot> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const patch: Partial<ProjectSessionSnapshot> = {};
  if (Array.isArray(record.openFilePaths)) patch.openFilePaths = record.openFilePaths.filter((item): item is string => typeof item === "string");
  if (record.panes && typeof record.panes === "object") patch.panes = record.panes as ProjectSessionSnapshot["panes"];
  if (typeof record.secondaryOpen === "boolean") patch.secondaryOpen = record.secondaryOpen;
  if (Array.isArray(record.expandedPaths)) patch.expandedPaths = record.expandedPaths.filter((item): item is string => typeof item === "string");
  if (record.mode === "edit" || record.mode === "review" || record.mode === "agents" || record.mode === "lazygit") patch.mode = record.mode;
  if (Array.isArray(record.terminalKinds)) {
    patch.terminalKinds = record.terminalKinds.filter((item): item is ProjectSessionSnapshot["terminalKinds"][number] =>
      item === "agent" || item === "shell" || item === "lazygit" || item === "custom");
  }
  // Session descriptors are server-owned. A browser snapshot may only update
  // presentation state; accepting process/provider identities here would allow
  // one project/session to be adopted by another without a live owner.
  return Object.keys(patch).length ? patch : undefined;
}

function requestParam(request: FastifyRequest, name: string): string {
  const value = (request.params as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

function promptRequest(value: Record<string, unknown>): AcpPromptRequest | undefined {
  if (typeof value.text !== "string" || !value.text.trim()) return undefined;
  if (value.context === undefined) return { text: value.text };
  if (!Array.isArray(value.context) || value.context.length > 100) return undefined;
  const context: AcpPromptContext[] = [];
  for (const item of value.context) {
    if (!item || typeof item !== "object") return undefined;
    const record = item as Record<string, unknown>;
    if (typeof record.path !== "string" || typeof record.content !== "string") return undefined;
    if (!isRelativePromptPath(record.path)) return undefined;
    if (record.language !== undefined && typeof record.language !== "string") return undefined;
    if (record.startLine !== undefined && (!Number.isInteger(record.startLine) || (record.startLine as number) < 1)) return undefined;
    if (record.endLine !== undefined && (!Number.isInteger(record.endLine) || (record.endLine as number) < 1)) return undefined;
    if (typeof record.startLine === "number" && typeof record.endLine === "number" && record.startLine > record.endLine) return undefined;
    context.push({
      path: record.path,
      content: record.content,
      ...(typeof record.language === "string" ? { language: record.language } : {}),
      ...(typeof record.startLine === "number" ? { startLine: record.startLine } : {}),
      ...(typeof record.endLine === "number" ? { endLine: record.endLine } : {}),
    });
  }
  return { text: value.text, context };
}

function isRelativePromptPath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/").trim();
  return Boolean(normalized)
    && !path.isAbsolute(normalized)
    && !path.win32.isAbsolute(normalized)
    && !normalized.split("/").some((part) => part === "..");
}

function requestResponse(value: Record<string, unknown>): AcpRequestResponse | undefined {
  if (value.outcome === "cancelled") return { outcome: "cancelled" };
  if (value.outcome === "selected" && typeof value.optionId === "string") return { outcome: "selected", optionId: value.optionId };
  if (value.action === "decline" || value.action === "cancel") return { action: value.action };
  if (value.action === "accept") {
    if (value.content !== undefined && (!value.content || typeof value.content !== "object" || Array.isArray(value.content))) return undefined;
    const content = value.content as Record<string, unknown> | undefined;
    if (content && Object.values(content).some((item) => typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean" && !(Array.isArray(item) && item.every((entry) => typeof entry === "string")))) return undefined;
    return { action: "accept", ...(content ? { content: content as Record<string, string | number | boolean | string[]> } : {}) };
  }
  return undefined;
}

export async function createServer(options: CreateServerOptions = {}): Promise<AinideServer> {
  const app = Fastify({ logger: false });
  await app.register(websocket);
  const token = randomBytes(32).toString("hex");
  const config = await loadConfig();
  const eventClients = new Set<WebSocket>();
  const acpEventClients = new Map<WebSocket, string | undefined>();
  const sendEvent = (event: WorkspaceEvent) => {
    const serialized = JSON.stringify(event);
    for (const client of eventClients) if (client.readyState === 1) client.send(serialized);
  };
  const sendAcpEvent = (event: import("@ainide/shared").AcpServerEvent) => {
    const serialized = JSON.stringify(event);
    for (const [client, projectId] of acpEventClients) {
      if (client.readyState === 1 && event.type !== "snapshot" && projectId === event.projectId) client.send(serialized);
    }
  };
  const projects = new ProjectRegistry(sendEvent);
  const terminals = new TerminalManager(() => projects.currentWorkspace?.rootPath, config);
  const review = new ReviewManager(() => projects.currentWorkspace?.rootPath);
  const stored = await loadSessionSnapshot();
  if (stored) projects.applyDiskSnapshot(stored);
  let persistTimer: NodeJS.Timeout | undefined;
  const persistNow = async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = undefined;
    }
    await saveSessionSnapshot({ ...projects.toSnapshot(), acpProviderPreferences: acp.providerPreferences() });
  };
  const persistSoon = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      void persistNow();
    }, 300);
  };
  const acpTerminals = new AcpTerminalManager();
  const acp = new AcpSessionManager({
    config,
    initialPreferences: stored?.acpProviderPreferences,
    onEvent: sendAcpEvent,
    onPreferencesChange: () => persistSoon(),
    resources: createAcpResourceHandlers(projects, acpTerminals),
    ...(options.acpListTimeoutMs !== undefined ? { listTimeoutMs: options.acpListTimeoutMs } : {}),
    onPersistenceChange: (projectId, descriptors) => {
      if (projects.updateUiSnapshot(projectId, { acpSessions: descriptors })) persistSoon();
    },
  });
  let restoreError: string | undefined;
  const applyLeavingSnapshot = (value: unknown) => {
    const patch = snapshotPatchFrom(value);
    if (patch && projects.activeId) projects.updateUiSnapshot(projects.activeId, patch);
  };
  const sessionPayload = (): SessionBootstrap => ({
    token,
    openProjects: projects.openProjects(),
    knownProjects: projects.knownProjects(),
    activeProjectId: projects.activeId ?? null,
    workspace: projects.currentWorkspace ?? null,
    snapshot: projects.activeId ? projects.snapshotFor(projects.activeId) : undefined,
    acpSessions: projects.activeId ? acp.list(projects.activeId) : [],
    ...(restoreError ? { restoreError } : {}),
  });
  const projectPayload = () => ({
    workspace: projects.currentWorkspace ?? null,
    activeProjectId: projects.activeId ?? null,
    openProjects: projects.openProjects(),
    knownProjects: projects.knownProjects(),
    snapshot: projects.activeId ? projects.snapshotFor(projects.activeId) : undefined,
    acpSessions: projects.activeId ? acp.list(projects.activeId) : [],
  });

  const sendAcpSnapshot = () => {
    const projectId = projects.activeId;
    const serialized = JSON.stringify(projectId ? acp.snapshot(projectId) : { type: "snapshot", projectId: "", sessions: [], history: {}, sequence: 0, sequences: {} });
    for (const [client] of acpEventClients) {
      acpEventClients.set(client, projectId);
      if (client.readyState === 1) client.send(serialized);
    }
  };

  const restoreRecordedAcpSessions = async (projectId: string): Promise<void> => {
    const snapshot = projects.snapshotFor(projectId);
    if (!snapshot?.acpSessions?.length) return;
    await acp.restore(projectId, snapshot.rootPath, snapshot.acpSessions);
  };

  const restoreRecordedTerminals = (projectId: string): void => {
    const snapshot = projects.snapshotFor(projectId);
    const recordedAgents = snapshot?.agentSessions;
    if (recordedAgents) {
      const existingAgents = terminals.list(projectId).filter((session) => session.kind === "agent");
      for (const descriptor of recordedAgents.slice(existingAgents.length)) {
        try { terminals.create({ kind: "agent", title: descriptor.title }); } catch { /* A recorded agent is best effort if PTYs are unavailable. */ }
      }
    }
    for (const kind of snapshot?.terminalKinds ?? []) {
      if (kind === "agent" && recordedAgents !== undefined) continue;
      if (terminals.listAliveKinds(projectId).includes(kind)) continue;
      try { terminals.create({ kind }); } catch { /* Optional tools such as lazygit may be missing. */ }
    }
  };

  if (stored?.activeRootPath) {
    try {
      const { workspace } = await projects.open(stored.activeRootPath);
      restoreRecordedTerminals(workspace.rootPath);
      await restoreRecordedAcpSessions(workspace.rootPath);
    } catch {
      restoreError = `Could not open last project: ${stored.activeRootPath}`;
      await persistNow();
    }
  }

  app.get("/api/session", async () => sessionPayload());
  app.addHook("onRequest", tokenGuard(token));

  app.get("/api/version", async () => {
    const current = options.update?.current ?? (await resolveLocalVersion());
    return {
      current,
      ...(options.update?.latest ? { latest: options.update.latest } : {}),
      ...(options.update?.notesUrl ? { notesUrl: options.update.notesUrl } : {}),
    };
  });

  app.get("/api/workspace", async () => projects.currentWorkspace ?? null);
  app.get("/api/workspace/children", async (request, reply) => {
    const values = request.query as { path?: unknown; query?: unknown };
    if (typeof values.path !== "string" || !values.path.trim()) return reply.code(400).send({ error: "path is required" });
    if (values.query !== undefined && typeof values.query !== "string") return reply.code(400).send({ error: "query must be a string" });
    try {
      return await listDirectoryChildren(values.path, values.query ?? "");
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to list directory" });
    }
  });
  const openProject = async (rawPath: string, leavingSnapshot: unknown) => {
    applyLeavingSnapshot(leavingSnapshot);
    const resolved = await new WorkspaceManager().validate(rawPath);
    if (projects.activeId && projects.activeId !== resolved) await review.stop();
    const result = await projects.open(rawPath);
    restoreRecordedTerminals(result.workspace.rootPath);
    await restoreRecordedAcpSessions(result.workspace.rootPath);
    sendAcpSnapshot();
    await persistNow();
    return result.workspace;
  };
  app.post("/api/workspace/open", async (request, reply) => {
    const value = body(request).path;
    if (typeof value !== "string" || !value.trim()) return reply.code(400).send({ error: "path must be a non-empty string" });
    try {
      return await openProject(value, body(request).snapshot);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to open workspace" }); }
  });
  app.post("/api/projects/open", async (request, reply) => {
    const value = body(request).path;
    if (typeof value !== "string" || !value.trim()) return reply.code(400).send({ error: "path must be a non-empty string" });
    try {
      await openProject(value, body(request).snapshot);
      return projectPayload();
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to open project" }); }
  });
  app.post("/api/projects/switch", async (request, reply) => {
    const projectId = body(request).projectId;
    if (typeof projectId !== "string" || !projectId.trim()) return reply.code(400).send({ error: "projectId is required" });
    try {
      applyLeavingSnapshot(body(request).snapshot);
      if (projects.activeId && projects.activeId !== projectId) await review.stop();
      await projects.switchTo(projectId);
      restoreRecordedTerminals(projectId);
      await restoreRecordedAcpSessions(projectId);
      sendAcpSnapshot();
      await persistNow();
      return projectPayload();
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to switch project" }); }
  });
  app.delete("/api/projects", async (request, reply) => {
    const projectId = body(request).projectId;
    if (typeof projectId !== "string" || !projectId.trim()) return reply.code(400).send({ error: "projectId is required" });
    try {
      applyLeavingSnapshot(body(request).snapshot);
      if (projects.activeId === projectId) await review.stop();
      await acp.closeByProject(projectId);
      terminals.closeByProject(projectId);
      await projects.closeProject(projectId);
      sendAcpSnapshot();
      await persistNow();
      return projectPayload();
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to close project" }); }
  });
  app.put("/api/projects/snapshot", async (request, reply) => {
    const values = body(request);
    const projectId = typeof values.projectId === "string" && values.projectId ? values.projectId : projects.activeId;
    if (!projectId) return reply.code(400).send({ error: "No project is active" });
    const patch = snapshotPatchFrom(values);
    if (!patch) return reply.code(400).send({ error: "A UI snapshot is required" });
    const updated = projects.updateUiSnapshot(projectId, patch);
    if (!updated) return reply.code(404).send({ error: "Project is not known" });
    persistSoon();
    return { ok: true, snapshot: updated };
  });
  app.get("/api/files", async (request, reply) => {
    try { return await projects.requireActive().list(queryPath(request)); } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/files/search", async (request, reply) => {
    const query = (request.query as { q?: unknown }).q;
    if (typeof query !== "string" || !query.trim()) return reply.code(400).send({ error: "q is required" });
    try { return await projects.requireActive().search(query); } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/file", async (request, reply) => {
    const relativePath = queryPath(request);
    if (!relativePath) return reply.code(400).send({ error: "path is required" });
    try { return await projects.requireActive().read(relativePath); } catch (error) { errorReply(reply, error); }
  });
  app.put("/api/file", async (request, reply) => {
    const values = body(request);
    if (typeof values.path !== "string" || typeof values.content !== "string") return reply.code(400).send({ error: "path and string content are required" });
    try { await projects.requireActive().write(values.path, values.content); return { ok: true }; } catch (error) { errorReply(reply, error); }
  });
  app.delete("/api/file", async (request, reply) => {
    const relativePath = queryPath(request);
    if (!relativePath) return reply.code(400).send({ error: "path is required" });
    try { await projects.requireActive().delete(relativePath); return { ok: true }; } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/file/rename", async (request, reply) => {
    const values = body(request);
    if (typeof values.from !== "string" || typeof values.to !== "string") return reply.code(400).send({ error: "from and to are required" });
    try { await projects.requireActive().rename(values.from, values.to); return { ok: true }; } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/file/create", async (request, reply) => {
    const values = body(request);
    if (typeof values.path !== "string" || (values.type !== "file" && values.type !== "directory")) {
      return reply.code(400).send({ error: "path and type (file or directory) are required" });
    }
    try {
      if (values.type === "file") await projects.requireActive().createFile(values.path);
      else await projects.requireActive().createDirectory(values.path);
      return { ok: true };
    } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/git/status", async (_request, reply) => {
    try { return await projects.requireActive().refreshGit(false); } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/git/compare", async (request, reply) => {
    const relativePath = queryPath(request);
    if (!relativePath) return reply.code(400).send({ error: "path is required" });
    try { return await projects.requireActive().compare(relativePath); } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/terminals", async () => projects.activeId ? terminals.list(projects.activeId) : []);
  app.post("/api/terminals", async (request, reply) => {
    try { return terminals.create(body(request)); } catch (error) { errorReply(reply, error); }
  });
  app.delete("/api/terminals/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!terminals.remove(id, projects.activeId)) return reply.code(404).send({ error: "Terminal session not found" });
    return { ok: true };
  });
  app.patch("/api/terminals/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const title = body(request).title;
    if (typeof title !== "string") return reply.code(400).send({ error: "title must be a string" });
    const renamed = terminals.rename(id, title, projects.activeId);
    if (!renamed) return reply.code(404).send({ error: "Terminal session not found or title is invalid" });
    return renamed;
  });
  const activeAcpSession = (id: string) => {
    const session = acp.get(id);
    if (!session) throw new AcpSessionError(404, "ACP session not found");
    if (!projects.activeId || session.projectId !== projects.activeId) throw new AcpSessionError(409, "ACP session does not belong to the active project");
    return session;
  };
  app.get("/api/acp/providers", async () => acp.providers(projects.activeId));
  app.get("/api/acp/providers/:providerId/sessions", async (request, reply) => {
    const projectId = projects.activeId;
    if (!projectId) return reply.code(409).send({ error: "Open a workspace before listing ACP sessions" });
    const providerId = requestParam(request, "providerId");
    if (!acp.providers(projectId).some((provider) => provider.id === providerId)) {
      return reply.code(404).send({ error: "Configured ACP provider not found" });
    }
    try {
      return await acp.listProviderSessions(providerId, projectId);
    } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/project/agents", async (request, reply) => {
    const requested = (request.query as { projectId?: unknown }).projectId;
    const rootPath = typeof requested === "string" && requested ? requested : projects.activeId;
    if (!rootPath) return reply.code(409).send({ error: "No project is active" });
    if (typeof requested === "string" && requested && !projects.isKnownOrOpen(rootPath)) {
      return reply.code(404).send({ error: "Project is not known or open" });
    }
    const all = (config.acpAgents ?? []).map(({ id, label }) => ({ id, label }));
    const disabled = config.projects?.get(rootPath)?.disabledAgents ?? [];
    return { all, disabled };
  });
  app.patch("/api/project/agents", async (request, reply) => {
    const values = body(request);
    const rootPath = values.rootPath;
    const disabledAgents = values.disabledAgents;
    if (typeof rootPath !== "string" || !rootPath) return reply.code(400).send({ error: "rootPath must be a non-empty string" });
    if (!Array.isArray(disabledAgents) || disabledAgents.some((item) => typeof item !== "string")) {
      return reply.code(400).send({ error: "disabledAgents must be an array of strings" });
    }
    if (!projects.isKnownOrOpen(rootPath)) return reply.code(404).send({ error: "Project is not known or open" });
    const configuredIds = new Set((config.acpAgents ?? []).map((agent) => agent.id));
    const effective = [...new Set(disabledAgents.filter((id) => configuredIds.has(id)))];
    if (!config.projects) config.projects = new Map();
    config.projects.set(rootPath, { disabledAgents: effective, buildCommands: config.projects.get(rootPath)?.buildCommands ?? [] });
    try {
      await saveConfig(config);
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : "Unable to save configuration" });
    }
    return { ok: true, rootPath, disabled: effective };
  });
  app.get("/api/project/builds", async (request, reply) => {
    const requested = (request.query as { projectId?: unknown }).projectId;
    const rootPath = typeof requested === "string" && requested ? requested : projects.activeId;
    if (!rootPath) return reply.code(409).send({ error: "No project is active" });
    if (typeof requested === "string" && requested && !projects.isKnownOrOpen(rootPath)) {
      return reply.code(404).send({ error: "Project is not known or open" });
    }
    return { commands: config.projects?.get(rootPath)?.buildCommands ?? [] };
  });
  app.patch("/api/project/builds", async (request, reply) => {
    const values = body(request);
    const rootPath = values.rootPath;
    if (typeof rootPath !== "string" || !rootPath) return reply.code(400).send({ error: "rootPath must be a non-empty string" });
    const commands = parseBuildCommands(values.commands);
    if (!commands) return reply.code(400).send({ error: "commands must be an array of { label, command } with at most 20 entries, labels 1-80 chars, and commands 1-500 chars" });
    if (!projects.isKnownOrOpen(rootPath)) return reply.code(404).send({ error: "Project is not known or open" });
    if (!config.projects) config.projects = new Map();
    const existing = config.projects.get(rootPath);
    config.projects.set(rootPath, { disabledAgents: existing?.disabledAgents ?? [], buildCommands: commands });
    try {
      await saveConfig(config);
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : "Unable to save configuration" });
    }
    return { ok: true, rootPath, commands };
  });
  app.get("/api/acp/sessions", async () => projects.activeId ? acp.list(projects.activeId) : []);
  app.get("/api/acp/sessions/:id", async (request, reply) => {
    try {
      const session = activeAcpSession(requestParam(request, "id"));
      return { session, history: acp.history(session.id) };
    } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/acp/sessions", async (request, reply) => {
    const values = body(request);
    const projectId = projects.activeId;
    if (!projectId) return reply.code(409).send({ error: "Open a workspace before creating an ACP session" });
    if (typeof values.providerId !== "string" || (values.title !== undefined && typeof values.title !== "string")) return reply.code(400).send({ error: "providerId and optional string title are required" });
    if (values.acpSessionId !== undefined && (typeof values.acpSessionId !== "string" || !values.acpSessionId.trim() || values.acpSessionId.length > 200)) {
      return reply.code(400).send({ error: "acpSessionId must be a non-empty string of at most 200 characters" });
    }
    try {
      return await acp.create({
        projectId,
        rootPath: projectId,
        providerId: values.providerId,
        ...(typeof values.title === "string" ? { title: values.title } : {}),
        ...(typeof values.acpSessionId === "string" ? { acpSessionId: values.acpSessionId } : {}),
      });
    } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/acp/sessions/:id/new", async (request, reply) => {
    try {
      const session = activeAcpSession(requestParam(request, "id"));
      return await acp.rollover(session.id);
    } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/acp/sessions/:id/prompt", async (request, reply) => {
    const parsed = promptRequest(body(request));
    if (!parsed) return reply.code(400).send({ error: "text and valid context are required" });
    try {
      const session = activeAcpSession(requestParam(request, "id"));
      await acp.prompt(session.id, parsed);
      return { ok: true };
    } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/acp/sessions/:id/cancel", async (request, reply) => {
    try {
      activeAcpSession(requestParam(request, "id"));
      await acp.cancel(requestParam(request, "id"));
      return { ok: true };
    } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/acp/sessions/:id/config", async (request, reply) => {
    const values = body(request);
    if (typeof values.configId !== "string" || (typeof values.value !== "string" && typeof values.value !== "boolean")) return reply.code(400).send({ error: "configId and string or boolean value are required" });
    try {
      const session = activeAcpSession(requestParam(request, "id"));
      return { options: await acp.setConfigOption(session.id, values.configId, values.value) };
    } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/acp/sessions/:id/auth", async (request, reply) => {
    const methodId = body(request).methodId;
    if (typeof methodId !== "string") return reply.code(400).send({ error: "methodId is required" });
    try {
      const session = activeAcpSession(requestParam(request, "id"));
      return await acp.authenticate(session.id, methodId);
    } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/acp/sessions/:id/requests/:requestId", async (request, reply) => {
    const response = requestResponse(body(request));
    if (!response) return reply.code(400).send({ error: "A valid permission or elicitation response is required" });
    try {
      const session = activeAcpSession(requestParam(request, "id"));
      acp.respondToRequest(session.id, requestParam(request, "requestId"), response);
      return { ok: true };
    } catch (error) { errorReply(reply, error); }
  });
  app.patch("/api/acp/sessions/:id", async (request, reply) => {
    const title = body(request).title;
    if (typeof title !== "string") return reply.code(400).send({ error: "title is required" });
    try { return acp.rename(activeAcpSession(requestParam(request, "id")).id, title); } catch (error) { errorReply(reply, error); }
  });
  app.delete("/api/acp/sessions/:id", async (request, reply) => {
    try {
      const session = activeAcpSession(requestParam(request, "id"));
      await acp.closeSession(session.id);
      return { ok: true };
    } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/review/start", async (request, reply) => {
    try { return await review.start(body(request).scope, body(request).restart === true); } catch (error) { errorReply(reply, error); }
  });
  app.post("/api/review/stop", async () => { await review.stop(); return review.getStatus(); });
  app.get("/api/review/status", async () => review.getStatus());

  app.get("/events", { websocket: true }, (socket, request) => {
    if (requestToken(request) !== token) return socket.close(1008, "Unauthorized");
    eventClients.add(socket);
    socket.on("close", () => eventClients.delete(socket));
  });
  app.get("/acp-events", { websocket: true }, (socket, request) => {
    if (requestToken(request) !== token) return socket.close(1008, "Unauthorized");
    const projectId = projects.activeId;
    acpEventClients.set(socket, projectId);
    socket.send(JSON.stringify(projectId ? acp.snapshot(projectId) : { type: "snapshot", projectId: "", sessions: [], history: {}, sequence: 0, sequences: {} }));
    socket.on("close", () => acpEventClients.delete(socket));
  });
  app.get("/terminal", { websocket: true }, (socket, request) => {
    if (requestToken(request) !== token) return socket.close(1008, "Unauthorized");
    const sessionId = (request.query as { sessionId?: unknown }).sessionId;
    terminals.connect(socket, typeof sessionId === "string" ? sessionId : undefined, projects.activeId);
  });

  const webDist = process.env.WEB_DIST ?? [
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
  ].find((candidate) => existsSync(candidate));
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/") && !request.url.startsWith("/events") && !request.url.startsWith("/terminal")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "Not found" });
    });
  }

  const close = async () => {
    await persistNow();
    eventClients.forEach((client) => { client.close(); });
    for (const [client] of acpEventClients) client.close();
    await acp.close();
    await acpTerminals.close();
    terminals.close();
    await review.close();
    await projects.closeAll();
    await app.close();
  };
  return { app, token, projects, terminals, acp, review, restoreError, close };
}

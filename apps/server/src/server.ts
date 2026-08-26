import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ProjectSessionSnapshot, SessionBootstrap, WorkspaceEvent } from "@ainide/shared";
import type { WebSocket } from "ws";
import { ReviewManager } from "./review.js";
import { TerminalError, TerminalManager } from "./terminals.js";
import { ProjectRegistry } from "./projects.js";
import { loadConfig } from "./config.js";
import { loadSessionSnapshot, saveSessionSnapshot } from "./sessions.js";
import { WorkspaceManager } from "./workspace.js";

export interface AinideServer {
  app: FastifyInstance;
  token: string;
  projects: ProjectRegistry;
  terminals: TerminalManager;
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
    const isWebSocket = pathname === "/events" || pathname === "/terminal";
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
  if (error instanceof TerminalError) {
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
  if (record.mode === "edit" || record.mode === "review") patch.mode = record.mode;
  if (Array.isArray(record.terminalKinds)) {
    patch.terminalKinds = record.terminalKinds.filter((item): item is ProjectSessionSnapshot["terminalKinds"][number] =>
      item === "agent" || item === "shell" || item === "lazygit" || item === "custom");
  }
  return Object.keys(patch).length ? patch : undefined;
}

export async function createServer(): Promise<AinideServer> {
  const app = Fastify({ logger: false });
  await app.register(websocket);
  const token = randomBytes(32).toString("hex");
  const config = await loadConfig();
  const eventClients = new Set<WebSocket>();
  const sendEvent = (event: WorkspaceEvent) => {
    const serialized = JSON.stringify(event);
    for (const client of eventClients) if (client.readyState === 1) client.send(serialized);
  };
  const projects = new ProjectRegistry(sendEvent);
  const terminals = new TerminalManager(() => projects.currentWorkspace?.rootPath, config);
  const review = new ReviewManager(() => projects.currentWorkspace?.rootPath);
  let persistTimer: NodeJS.Timeout | undefined;
  const persistNow = async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = undefined;
    }
    await saveSessionSnapshot(projects.toSnapshot());
  };
  const persistSoon = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      void persistNow();
    }, 300);
  };
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
    ...(restoreError ? { restoreError } : {}),
  });
  const projectPayload = () => ({
    workspace: projects.currentWorkspace ?? null,
    activeProjectId: projects.activeId ?? null,
    openProjects: projects.openProjects(),
    knownProjects: projects.knownProjects(),
    snapshot: projects.activeId ? projects.snapshotFor(projects.activeId) : undefined,
  });

  const stored = await loadSessionSnapshot();
  if (stored) projects.applyDiskSnapshot(stored);
  if (stored?.activeRootPath) {
    try {
      const { workspace } = await projects.open(stored.activeRootPath);
      const recorded = projects.snapshotFor(workspace.rootPath)?.terminalKinds ?? [];
      for (const kind of recorded) {
        if (terminals.listAliveKinds(workspace.rootPath).includes(kind)) continue;
        try { terminals.create({ kind }); } catch { /* Optional tools such as lazygit may be missing. */ }
      }
    } catch {
      restoreError = `Could not open last project: ${stored.activeRootPath}`;
      await persistNow();
    }
  }

  app.get("/api/session", async () => sessionPayload());
  app.addHook("onRequest", tokenGuard(token));

  app.get("/api/workspace", async () => projects.currentWorkspace ?? null);
  const openProject = async (rawPath: string, leavingSnapshot: unknown) => {
    applyLeavingSnapshot(leavingSnapshot);
    const resolved = await new WorkspaceManager().validate(rawPath);
    if (projects.activeId && projects.activeId !== resolved) await review.stop();
    const result = await projects.open(rawPath);
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
      terminals.closeByProject(projectId);
      await projects.closeProject(projectId);
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
  app.get("/api/git/status", async (request, reply) => {
    try { return await projects.requireActive().refreshGit(); } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/terminals", async () => projects.activeId ? terminals.list(projects.activeId) : []);
  app.post("/api/terminals", async (request, reply) => {
    try { return terminals.create(body(request)); } catch (error) { errorReply(reply, error); }
  });
  app.delete("/api/terminals/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!terminals.remove(id)) return reply.code(404).send({ error: "Terminal session not found" });
    return { ok: true };
  });
  app.patch("/api/terminals/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const title = body(request).title;
    if (typeof title !== "string") return reply.code(400).send({ error: "title must be a string" });
    const renamed = terminals.rename(id, title);
    if (!renamed) return reply.code(404).send({ error: "Terminal session not found or title is invalid" });
    return renamed;
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
  app.get("/terminal", { websocket: true }, (socket, request) => {
    if (requestToken(request) !== token) return socket.close(1008, "Unauthorized");
    const sessionId = (request.query as { sessionId?: unknown }).sessionId;
    terminals.connect(socket, typeof sessionId === "string" ? sessionId : undefined);
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
    if (persistTimer) clearTimeout(persistTimer);
    eventClients.forEach((client) => client.close());
    terminals.close();
    await review.close();
    await projects.closeAll();
    await app.close();
  };
  return { app, token, projects, terminals, review, restoreError, close };
}
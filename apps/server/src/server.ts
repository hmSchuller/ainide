import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { WorkspaceEvent } from "@ainide/shared";
import type { WebSocket } from "ws";
import { ReviewManager } from "./review.js";
import { TerminalError, TerminalManager } from "./terminals.js";
import { WorkspaceManager } from "./workspace.js";
import { loadConfig } from "./config.js";

export interface AinideServer {
  app: FastifyInstance;
  token: string;
  workspace: WorkspaceManager;
  terminals: TerminalManager;
  review: ReviewManager;
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

export async function createServer(): Promise<AinideServer> {
  const app = Fastify({ logger: false });
  await app.register(websocket);
  const token = randomBytes(32).toString("hex");
  const config = await loadConfig();
  const workspace = new WorkspaceManager();
  const terminals = new TerminalManager(() => workspace.current?.rootPath, config);
  const review = new ReviewManager(() => workspace.current?.rootPath);
  const eventClients = new Set<WebSocket>();
  const sendEvent = (event: WorkspaceEvent) => {
    const serialized = JSON.stringify(event);
    for (const client of eventClients) if (client.readyState === 1) client.send(serialized);
  };
  workspace.onEvent(sendEvent);

  app.get("/api/session", async () => ({ token }));
  app.addHook("onRequest", tokenGuard(token));

  app.get("/api/workspace", async () => workspace.current ?? null);
  app.post("/api/workspace/open", async (request, reply) => {
    const value = body(request).path;
    if (typeof value !== "string" || !value.trim()) return reply.code(400).send({ error: "path must be a non-empty string" });
    try {
      await workspace.validate(value);
      await review.stop();
      terminals.close();
      return await workspace.open(value);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to open workspace" }); }
  });
  app.get("/api/files", async (request, reply) => {
    try { return await workspace.list(queryPath(request)); } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/files/search", async (request, reply) => {
    const query = (request.query as { q?: unknown }).q;
    if (typeof query !== "string" || !query.trim()) return reply.code(400).send({ error: "q is required" });
    try { return await workspace.search(query); } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/file", async (request, reply) => {
    const relativePath = queryPath(request);
    if (!relativePath) return reply.code(400).send({ error: "path is required" });
    try { return await workspace.read(relativePath); } catch (error) { errorReply(reply, error); }
  });
  app.put("/api/file", async (request, reply) => {
    const values = body(request);
    if (typeof values.path !== "string" || typeof values.content !== "string") return reply.code(400).send({ error: "path and string content are required" });
    try { await workspace.write(values.path, values.content); return { ok: true }; } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/git/status", async (request, reply) => {
    try { return await workspace.refreshGit(); } catch (error) { errorReply(reply, error); }
  });
  app.get("/api/terminals", async () => terminals.list());
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
    eventClients.forEach((client) => client.close());
    terminals.close();
    await review.close();
    await workspace.close();
    await app.close();
  };
  return { app, token, workspace, terminals, review, close };
}

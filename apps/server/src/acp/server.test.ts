import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createServer, type AinideServer } from "../server.js";

const servers: AinideServer[] = [];
const environments: Array<{ sessions?: string; config?: string }> = [];

async function project(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await writeFile(path.join(root, "readme.txt"), "hello\n", "utf8");
  return root;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(predicate()).toBe(true);
}

function providerScript(): string {
  return [
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');",
    "const update = (sessionId) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', messageId: 'server-message', content: { type: 'text', text: 'server response' } } } }) + '\\n');",
    "const commands = (sessionId) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: { sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'review', description: 'Review the current changes', input: { hint: 'scope to review' } }, { name: 'skill', description: 'Run a provider skill' }] } } }) + '\\n');",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line);",
     "  if (message.method === 'initialize') send(message.id, { protocolVersion: 1, agentCapabilities: { loadSession: true, sessionCapabilities: { close: {} } }, authMethods: [] });",
     "  else if (message.method === 'session/new') { send(message.id, { sessionId: 'server-provider-session' }); setTimeout(() => commands('server-provider-session'), 0); }",
     "  else if (message.method === 'session/load') { send(message.id, {}); setTimeout(() => commands('server-provider-session'), 0); }",
    "  else if (message.method === 'session/prompt') { update('server-provider-session'); send(message.id, { stopReason: 'end_turn' }); }",
    "  else if (message.method === 'session/close') send(message.id, {});",
    "});",
  ].join('\n');
}

function headers(token: string, json = true): Record<string, string> {
  return json ? { "x-session-token": token, "content-type": "application/json" } : { "x-session-token": token };
}

async function startServer(): Promise<{ server: AinideServer; sessionsPath: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ainide-acp-server-"));
  const sessionsPath = path.join(directory, "sessions.json");
  const configPath = path.join(directory, "config.json");
  await writeFile(configPath, JSON.stringify({ acpAgents: [{ id: "fake", label: "Fake ACP", command: process.execPath, args: ["-e", providerScript()], env: { ACP_SERVER_TEST: "secret" } }] }), "utf8");
  const previousSessions = process.env.AINIDE_SESSIONS;
  const previousConfig = process.env.AINIDE_CONFIG;
  environments.push({ sessions: previousSessions, config: previousConfig });
  process.env.AINIDE_SESSIONS = sessionsPath;
  process.env.AINIDE_CONFIG = configPath;
  const server = await createServer();
  servers.push(server);
  return { server, sessionsPath };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  const environment = environments.splice(0, 1)[0];
  if (environment?.sessions === undefined) delete process.env.AINIDE_SESSIONS;
  else process.env.AINIDE_SESSIONS = environment.sessions;
  if (environment?.config === undefined) delete process.env.AINIDE_CONFIG;
  else process.env.AINIDE_CONFIG = environment.config;
});

describe("ACP server API", () => {
  it("lists safe providers, starts sessions, streams prompt results, and persists descriptors", async () => {
    const root = await project("ainide-acp-api-");
    const { server, sessionsPath } = await startServer();
    const auth = headers(server.token);
    expect((await server.app.inject({ method: "GET", url: "/api/acp/providers" })).statusCode).toBe(401);

    const providers = await server.app.inject({ method: "GET", url: "/api/acp/providers", headers: auth });
    expect(providers.json()).toEqual([{ id: "fake", label: "Fake ACP" }]);
    expect(providers.body).not.toContain("ACP_SERVER_TEST");

    const opened = await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: root } });
    expect(opened.statusCode).toBe(200);
    const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers: auth, payload: { providerId: "fake", title: "API session" } });
    expect(created.statusCode).toBe(200);
    const session = created.json();
    expect(session).toMatchObject({ title: "API session", providerId: "fake", status: "live" });
    expect(session).not.toHaveProperty("command");
    await waitFor(() => server.acp.get(session.id)?.availableCommands.length === 2);
    expect(server.acp.history(session.id)).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "available_commands_update" })]));
    expect((await server.app.inject({ method: "GET", url: `/api/acp/sessions/${session.id}`, headers: headers(server.token, false) })).json().session.availableCommands).toEqual([
      { name: "review", description: "Review the current changes", inputHint: "scope to review" },
      { name: "skill", description: "Run a provider skill" },
    ]);

    const prompt = await server.app.inject({ method: "POST", url: `/api/acp/sessions/${session.id}/prompt`, headers: auth, payload: { text: "Hello" } });
    expect(prompt.statusCode).toBe(200);
    const detail = await server.app.inject({ method: "GET", url: `/api/acp/sessions/${session.id}`, headers: headers(server.token, false) });
    expect(detail.json().history).toEqual(expect.arrayContaining([expect.objectContaining({ type: "message", role: "agent", text: "server response" })]));

    await server.close();
    servers.splice(servers.indexOf(server), 1);
    const saved = JSON.parse(await readFile(sessionsPath, "utf8")) as { projects: Array<{ acpSessions?: unknown[] }> };
    expect(saved.projects[0]?.acpSessions).toEqual([expect.objectContaining({ title: "API session", titleSource: "user", providerId: "fake", acpSessionId: "server-provider-session" })]);
    expect(JSON.stringify(saved)).not.toContain("availableCommands");
  });

  it("creates an ACP session without a title and uses the configured provider label", async () => {
    const root = await project("ainide-acp-api-untitled-");
    const { server } = await startServer();
    const auth = headers(server.token);
    await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: root } });

    const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers: auth, payload: { providerId: "fake" } });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ title: "Fake ACP", titleSource: "provider" });
  });

  it("rejects malformed commands and inactive-project session access", async () => {
    const first = await project("ainide-acp-api-first-");
    const second = await project("ainide-acp-api-second-");
    const { server } = await startServer();
    const auth = headers(server.token);
    await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: first } });
    const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers: auth, payload: { providerId: "fake", title: "First" } });
    const sessionId = created.json().id as string;
    expect((await server.app.inject({ method: "POST", url: `/api/acp/sessions/${sessionId}/prompt`, headers: auth, payload: { text: "" } })).statusCode).toBe(400);

    await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: second } });
    expect((await server.app.inject({ method: "GET", url: `/api/acp/sessions/${sessionId}`, headers: headers(server.token, false) })).statusCode).toBe(409);
    expect((await server.app.inject({ method: "GET", url: "/api/acp/sessions", headers: headers(server.token, false) })).json()).toEqual([]);
  });

  it("rejects unknown providers, missing sessions, unsafe prompt context, and invalid request responses", async () => {
    const root = await project("ainide-acp-api-validation-");
    const { server } = await startServer();
    const auth = headers(server.token);
    await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: root } });
    expect((await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers: auth, payload: { providerId: "missing", title: "Missing" } })).statusCode).toBe(400);
    expect((await server.app.inject({ method: "GET", url: "/api/acp/sessions/missing", headers: headers(server.token, false) })).statusCode).toBe(404);
    const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers: auth, payload: { providerId: "fake", title: "Validation" } });
    const sessionId = created.json().id as string;
    expect((await server.app.inject({ method: "POST", url: `/api/acp/sessions/${sessionId}/prompt`, headers: auth, payload: { text: "Context", context: [{ path: "../outside.txt", content: "not allowed" }] } })).statusCode).toBe(400);
    expect((await server.app.inject({ method: "POST", url: `/api/acp/sessions/${sessionId}/requests/missing`, headers: auth, payload: { outcome: "selected", optionId: "allow" } })).statusCode).toBe(404);
  });

  it("replays the active project snapshot and delivers only its live events", async () => {
    const root = await project("ainide-acp-api-events-");
    const { server } = await startServer();
    const auth = headers(server.token);
    await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: root } });
    const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers: auth, payload: { providerId: "fake", title: "Events" } });
    const session = created.json() as { id: string };
    await waitFor(() => server.acp.get(session.id)?.availableCommands.length === 2);
    const address = await server.app.listen({ host: "127.0.0.1", port: 0 });
    const socket = new WebSocket(`${address.replace("http", "ws")}/acp-events?token=${server.token}`);
    const message = await new Promise<unknown>((resolve, reject) => {
      socket.once("message", (data) => resolve(JSON.parse(data.toString())));
      socket.once("error", reject);
    });
    expect(message).toMatchObject({ type: "snapshot", projectId: server.projects.activeId, sessions: [expect.objectContaining({ id: session.id, availableCommands: expect.arrayContaining([expect.objectContaining({ name: "review" }), expect.objectContaining({ name: "skill" })]) })] });
    const event = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ACP event timed out")), 3_000);
      socket.on("message", (data) => {
        const value = JSON.parse(data.toString()) as { type?: string; event?: { type?: string } };
        if (value.type === "session_event" && value.event?.type === "activity") {
          clearTimeout(timer);
          resolve(value);
        }
      });
    });
    await server.app.inject({ method: "POST", url: `/api/acp/sessions/${session.id}/prompt`, headers: auth, payload: { text: "Hello" } });
    expect(await event).toMatchObject({ type: "session_event", sessionId: session.id, event: { type: "activity" } });
    socket.close();
  });

  it("keeps sessions alive after browser detachment and replays existing history on reconnect", async () => {
    const root = await project("ainide-acp-api-reconnect-");
    const { server } = await startServer();
    const auth = headers(server.token);
    await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: root } });
    const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers: auth, payload: { providerId: "fake", title: "Reconnect" } });
    const session = created.json() as { id: string };
    const address = await server.app.listen({ host: "127.0.0.1", port: 0 });
    const first = new WebSocket(`${address.replace("http", "ws")}/acp-events?token=${server.token}`);
    await new Promise<void>((resolve, reject) => { first.once("message", () => resolve()); first.once("error", reject); });
    first.close();

    const prompt = await server.app.inject({ method: "POST", url: `/api/acp/sessions/${session.id}/prompt`, headers: auth, payload: { text: "Detached prompt" } });
    expect(prompt.statusCode).toBe(200);
    expect(server.acp.get(session.id)?.status).toBe("live");

    const second = new WebSocket(`${address.replace("http", "ws")}/acp-events?token=${server.token}`);
    const replay = await new Promise<unknown>((resolve, reject) => { second.once("message", (data) => resolve(JSON.parse(data.toString()))); second.once("error", reject); });
    expect(replay).toMatchObject({ type: "snapshot", sessions: [expect.objectContaining({ id: session.id, availableCommands: expect.arrayContaining([expect.objectContaining({ name: "review" }), expect.objectContaining({ name: "skill" })]) })], history: { [session.id]: expect.arrayContaining([expect.objectContaining({ type: "message", text: "server response" })]) } });
    second.close();
  });

  it("does not deliver hidden project events and cleans ACP sessions on project close", async () => {
    const firstRoot = await project("ainide-acp-api-hidden-first-");
    const secondRoot = await project("ainide-acp-api-hidden-second-");
    const { server, sessionsPath } = await startServer();
    const auth = headers(server.token);
    await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: firstRoot } });
    const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers: auth, payload: { providerId: "fake", title: "Hidden" } });
    const sessionId = created.json().id as string;
    await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: secondRoot } });
    const firstProjectId = server.projects.knownProjects().find((project) => project.name === path.basename(firstRoot))?.projectId;
    if (!firstProjectId) throw new Error("first project was not registered");
    const address = await server.app.listen({ host: "127.0.0.1", port: 0 });
    const socket = new WebSocket(`${address.replace("http", "ws")}/acp-events?token=${server.token}`);
    let messages = 0;
    await new Promise<void>((resolve, reject) => { socket.once("message", () => { messages += 1; resolve(); }); socket.once("error", reject); });
    await server.acp.prompt(sessionId, { text: "Hidden prompt" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(messages).toBe(1);
    socket.close();

    const closed = await server.app.inject({ method: "DELETE", url: "/api/projects", headers: auth, payload: { projectId: firstProjectId } });
    expect(closed.statusCode).toBe(200);
    expect(server.acp.get(sessionId)).toBeUndefined();
    const saved = JSON.parse(await readFile(sessionsPath, "utf8")) as { projects: Array<{ rootPath: string; acpSessions?: unknown[] }> };
    expect(saved.projects.find((project) => project.rootPath === firstProjectId)?.acpSessions).toEqual([]);
  });

  it("rejects unauthorized ACP WebSocket handshakes", async () => {
    const { server } = await startServer();
    const address = await server.app.listen({ host: "127.0.0.1", port: 0 });
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`${address.replace("http", "ws")}/acp-events?token=wrong-token`);
      socket.once("unexpected-response", (_request, response) => { expect(response.statusCode).toBe(401); resolve(); });
      socket.once("error", (error) => { if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error); });
      socket.once("close", () => resolve());
    });
  });

  it("restores a resumable ACP descriptor after a server restart", async () => {
    const root = await project("ainide-acp-api-restore-");
    const { server } = await startServer();
    const auth = headers(server.token);
    await server.app.inject({ method: "POST", url: "/api/projects/open", headers: auth, payload: { path: root } });
    const created = await server.app.inject({ method: "POST", url: "/api/acp/sessions", headers: auth, payload: { providerId: "fake", title: "Restored" } });
    const sessionId = created.json().id as string;
    const projectId = server.projects.activeId;
    if (!projectId) throw new Error("project was not activated");
    await server.close();
    servers.splice(servers.indexOf(server), 1);

    const restoredServer = await createServer();
    servers.push(restoredServer);
    expect(restoredServer.acp.get(sessionId)).toMatchObject({ id: sessionId, status: "live", resumability: "restored" });
    expect(restoredServer.acp.list(projectId)).toHaveLength(1);
  });
});

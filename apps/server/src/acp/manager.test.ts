import { describe, expect, it, vi } from "vitest";
import type { AcpServerEvent } from "@ainide/shared";
import type { AinideConfig } from "../config.js";
import { AcpSessionManager, type AcpResourceHandlers } from "./manager.js";

function fakeProviderScript(): string {
  return [
    "const readline = require('node:readline');",
    "const mode = process.env.ACP_TEST_MODE || 'prompt';",
    "const rl = readline.createInterface({ input: process.stdin });",
    "let activePromptId;",
    "const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');",
    "const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\\n');",
    "const update = (sessionId, text) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', messageId: 'message-1', content: { type: 'text', text } } } }) + '\\n');",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line);",
    "  if (message.method === 'initialize') {",
    "    send(message.id, { protocolVersion: mode === 'bad-protocol' ? 99 : 1, agentCapabilities: mode === 'non-resumable' ? { sessionCapabilities: {} } : { loadSession: true, sessionCapabilities: { resume: {}, close: {} } }, authMethods: mode === 'auth' ? [{ id: 'local', name: 'Local login' }] : [] });",
    "  } else if (message.method === 'authenticate') { process.env.ACP_AUTHENTICATED = 'true'; send(message.id, {}); }",
    "  else if (message.method === 'session/new') {",
    "    if (mode === 'stderr') fail(message.id, -32001, 'API_KEY=' + process.env.API_KEY);",
    "    else if (mode === 'auth' && !process.env.ACP_AUTHENTICATED) fail(message.id, -32000, 'Authentication required');",
    "    else { process.env.ACP_AUTHENTICATED = 'true'; send(message.id, { sessionId: 'provider-session-1', configOptions: [{ type: 'boolean', id: 'thinking', name: 'Thinking', currentValue: true }] }); if (mode === 'exit') setTimeout(() => process.exit(7), 20); }",
    "  } else if (message.method === 'session/load') send(message.id, { configOptions: [{ type: 'boolean', id: 'thinking', name: 'Thinking', currentValue: true }] });",
    "  else if (message.method === 'session/set_config_option') send(message.id, { configOptions: [{ type: 'boolean', id: 'thinking', name: 'Thinking', currentValue: message.params.value }] });",
    "  else if (message.method === 'session/close') send(message.id, {});",
    "  else if (message.method === 'session/cancel') { if (mode !== 'close-pending') send(activePromptId, { stopReason: 'cancelled' }); }",
    "  else if (message.method === 'session/prompt') {",
    "    activePromptId = message.id;",
    "    if (mode === 'failure') fail(message.id, -32001, 'Provider turn failed');",
    "    else if (mode === 'exit-prompt') setTimeout(() => process.exit(8), 20);",
    "    else if (mode === 'bad-resource') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 101, method: 'fs/read_text_file', params: { sessionId: 'wrong-session', path: '/tmp/secret' } }) + '\\n');",
    "    else if (mode === 'elicitation') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'elicitation/create', params: { mode: 'form', sessionId: 'provider-session-1', message: 'What is your name?', requestedSchema: { type: 'object', properties: { name: { type: 'string', title: 'Name' } }, required: ['name'] } } }) + '\\n');",
    "    else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'session/request_permission', params: { sessionId: 'provider-session-1', toolCall: { toolCallId: 'tool-1', title: 'Run command', status: 'pending' }, options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }] } }) + '\\n');",
    "  } else if (message.id === 100) { update('provider-session-1', mode === 'elicitation' ? 'elicitation accepted' : 'permission granted'); if (mode === 'elicitation') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'elicitation/complete', params: { elicitationId: 'url-elicitation-1' } }) + '\\n'); send(activePromptId, { stopReason: 'end_turn' }); }",
    "  else if (message.id === 101) { update('provider-session-1', message.error ? 'resource denied' : 'resource allowed'); send(activePromptId, { stopReason: 'end_turn' }); }",
    "});",
  ].join("\n");
}

function manager(mode: string, onEvent: (event: AcpServerEvent) => void, resources?: AcpResourceHandlers): AcpSessionManager {
  const config: AinideConfig = {
    acpAgents: [{
      id: "fake",
      label: "Fake provider",
      command: process.execPath,
      args: ["-e", fakeProviderScript()],
       env: { ACP_TEST_MODE: mode, API_KEY: "redact-me" },
    }],
  };
  return new AcpSessionManager({ config, onEvent, resources });
}

function managerWithProviders(providers: NonNullable<AinideConfig["acpAgents"]>, onEvent: (event: AcpServerEvent) => void): AcpSessionManager {
  return new AcpSessionManager({ config: { acpAgents: providers }, onEvent });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(predicate()).toBe(true);
}

describe("ACP session manager", () => {
  it("starts a provider, routes a prompt, and resolves a permission request", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("prompt", (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "  Coding  " });

    expect(session.status).toBe("live");
    expect(session.providerLabel).toBe("Fake provider");
    const prompt = sessions.prompt(session.id, { text: "Make the change" });
    await waitFor(() => events.some((event) => event.type === "session_event" && event.event.type === "request"));
    const requestEvent = events.find((event): event is Extract<AcpServerEvent, { type: "session_event" }> => event.type === "session_event" && event.event.type === "request");
    if (!requestEvent || requestEvent.event.type !== "request" || requestEvent.event.request.type !== "permission") throw new Error("permission request was not emitted");
    expect(sessions.get(session.id)?.status).toBe("waiting");

    sessions.respondToRequest(session.id, requestEvent.event.request.request.requestId, { outcome: "selected", optionId: "allow" });
    await prompt;

    expect(sessions.history(session.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "message", role: "user", text: "Make the change" }),
      expect.objectContaining({ type: "message", role: "agent", text: "permission granted" }),
      expect.objectContaining({ type: "turn", status: "completed" }),
    ]));
    await sessions.close();
  });

  it("keeps two sessions in the same project independent", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("prompt", (event) => events.push(event));
    const first = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "First" });
    const second = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Second" });

    const prompt = sessions.prompt(first.id, { text: "Only first" });
    await waitFor(() => events.some((event) => event.type === "session_event" && event.sessionId === first.id && event.event.type === "request"));
    const firstRequest = events.find((event): event is Extract<AcpServerEvent, { type: "session_event" }> => event.type === "session_event" && event.sessionId === first.id && event.event.type === "request");
    if (!firstRequest || firstRequest.event.type !== "request") throw new Error("first permission request was not emitted");
    sessions.respondToRequest(first.id, firstRequest.event.request.request.requestId, { outcome: "selected", optionId: "allow" });
    await prompt;

    expect(sessions.get(first.id)?.status).toBe("live");
    expect(sessions.get(second.id)?.status).toBe("live");
    expect(sessions.history(second.id)).toEqual([]);
    await sessions.close();
  });

  it("keeps provider configuration options scoped to one session", async () => {
    const sessions = manager("prompt", () => undefined);
    const first = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "First config" });
    const second = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Second config" });

    await expect(sessions.setConfigOption(first.id, "thinking", false)).resolves.toEqual([expect.objectContaining({ id: "thinking", currentValue: false })]);
    expect(sessions.get(first.id)?.configOptions[0]?.currentValue).toBe(false);
    expect(sessions.get(second.id)?.configOptions[0]?.currentValue).toBe(true);
    await sessions.close();
  });

  it("keeps authentication-required sessions addressable until authentication succeeds", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("auth", (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Auth session" });

    expect(session.status).toBe("auth_required");
    expect(session.authMethods).toEqual([expect.objectContaining({ id: "local", type: "agent" })]);
    await expect(sessions.prompt(session.id, { text: "Not yet" })).rejects.toMatchObject({ statusCode: 401 });

    const authenticated = await sessions.authenticate(session.id, "local");
    expect(authenticated.status).toBe("live");
    expect(authenticated.acpSessionId).toBe("provider-session-1");
    expect(events.some((event) => event.type === "session_event" && event.event.type === "status" && event.event.session.status === "live")).toBe(true);
    await sessions.close();
  });

  it("rejects unknown or unavailable providers without changing existing sessions", async () => {
    const events: AcpServerEvent[] = [];
    const providers = [
      { id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "restore" } },
      { id: "missing", label: "Missing provider", command: "ainide-provider-does-not-exist", args: [] },
    ];
    const sessions = managerWithProviders(providers, (event) => events.push(event));
    const existing = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Existing" });

    await expect(sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "unknown", title: "Unknown" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "missing", title: "Missing" })).rejects.toMatchObject({ statusCode: 503 });
    expect(sessions.get(existing.id)).toMatchObject({ id: existing.id, status: "live" });
    expect(sessions.list()).toHaveLength(1);
    await sessions.close();
  });

  it("restores persisted provider sessions when the provider advertises loading", async () => {
    const sessions = manager("restore", () => undefined);
    const restored = await sessions.restore("project-1", process.cwd(), [{
      id: "local-session-1",
      title: "Restored session",
      providerId: "fake",
      acpSessionId: "provider-session-1",
      resumability: "resumable",
    }]);

    expect(restored[0]).toMatchObject({ id: "local-session-1", status: "live", resumability: "restored" });
    expect(restored[0]?.configOptions).toEqual([expect.objectContaining({ id: "thinking", currentValue: true })]);
    await sessions.close();
  });

  it("does not forward provider callbacks for another session", async () => {
    const readTextFile = vi.fn(async () => ({ content: "secret" }));
    const sessions = manager("bad-resource", () => undefined, { readTextFile });
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Ownership" });

    await sessions.prompt(session.id, { text: "Try a file read" });
    expect(readTextFile).not.toHaveBeenCalled();
    expect(sessions.history(session.id)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "message", text: "resource denied" })]));
    await sessions.close();
  });

  it("rejects a second active prompt and reaches the provider on cancellation", async () => {
    const sessions = manager("prompt", () => undefined);
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Cancellation" });
    const prompt = sessions.prompt(session.id, { text: "Cancel this" });
    await waitFor(() => sessions.get(session.id)?.status === "waiting");
    await expect(sessions.prompt(session.id, { text: "Second prompt" })).rejects.toMatchObject({ statusCode: 409 });
    await sessions.cancel(session.id);
    await prompt;
    expect(sessions.history(session.id)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "turn", status: "cancelled" })]));
    await sessions.close();
  });

  it("records provider prompt failures without affecting other sessions", async () => {
    const sessions = manager("failure", () => undefined);
    const failed = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Failure" });
    const healthy = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Healthy" });

    await sessions.prompt(failed.id, { text: "Fail this" });
    expect(sessions.get(failed.id)?.status).toBe("failed");
    expect(sessions.history(failed.id)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "turn", status: "failed" })]));
    expect(sessions.get(healthy.id)?.status).toBe("live");
    await sessions.close();
  });

  it("tracks elicitation requests and resolves them with explicit browser input", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("elicitation", (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Elicitation" });
    const prompt = sessions.prompt(session.id, { text: "Ask me" });
    await waitFor(() => events.some((event) => event.type === "session_event" && event.event.type === "request"));
    const requestEvent = events.find((event): event is Extract<AcpServerEvent, { type: "session_event" }> => event.type === "session_event" && event.event.type === "request");
    if (!requestEvent || requestEvent.event.type !== "request" || requestEvent.event.request.type !== "elicitation") throw new Error("elicitation request was not emitted");
    expect(requestEvent.event.request.request.fields).toEqual([expect.objectContaining({ id: "name", type: "text", required: true })]);
    sessions.respondToRequest(session.id, requestEvent.event.request.request.requestId, { action: "accept", content: { name: "AINIDE" } });
    await prompt;
    expect(sessions.history(session.id)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "message", text: "elicitation accepted" })]));
    expect(sessions.history(session.id)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "unknown", name: "elicitation/complete" })]));
    await sessions.close();
  });

  it("resolves pending requests when a session closes", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("close-pending", (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Close pending" });
    const prompt = sessions.prompt(session.id, { text: "Close me" });
    await waitFor(() => events.some((event) => event.type === "session_event" && event.event.type === "request"));
    await sessions.closeSession(session.id);
    await prompt;
    expect(sessions.get(session.id)).toBeUndefined();
  });

  it("does not present a provider without load or resume support as a restored continuation", async () => {
    const sessions = manager("non-resumable", () => undefined);
    const restored = await sessions.restore("project-1", process.cwd(), [{
      id: "local-session-2",
      title: "Old session",
      providerId: "fake",
      acpSessionId: "provider-session-1",
      resumability: "resumable",
    }]);

    expect(restored[0]).toMatchObject({ status: "non_resumable", resumability: "non_resumable" });
    await sessions.close();
  });

  it("does not start a provider for a descriptor already marked non-resumable", async () => {
    const sessions = manager("bad-protocol", () => undefined);
    const restored = await sessions.restore("project-1", process.cwd(), [{
      id: "local-session-4",
      title: "Explicitly new session required",
      providerId: "fake",
      acpSessionId: "provider-session-1",
      resumability: "non_resumable",
    }]);

    expect(restored[0]).toMatchObject({ status: "non_resumable", resumability: "non_resumable" });
    await sessions.close();
  });

  it("keeps a missing restored provider visible without starting a replacement session", async () => {
    const sessions = manager("restore", () => undefined);
    const restored = await sessions.restore("project-1", process.cwd(), [{
      id: "local-session-3",
      title: "Missing provider session",
      providerId: "missing",
      acpSessionId: "provider-session-1",
      resumability: "resumable",
    }]);

    expect(restored[0]).toMatchObject({ providerId: "missing", status: "failed" });
    expect(sessions.history("local-session-3")).toEqual([]);
    await sessions.close();
  });

  it("redacts provider environment secrets from startup errors", async () => {
    const sessions = manager("stderr", () => undefined);
    const error = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Secret" }).then(() => undefined, (reason) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("redact-me");
    expect((error as Error).message).toContain("[redacted]");
    await sessions.close();
  });

  it("isolates provider exit and rejects an invalid protocol version", async () => {
    const closeOwnedResources = vi.fn(async () => undefined);
    const exitingOnly = manager("exit", () => undefined, { closeSession: closeOwnedResources });
    const exitingSession = await exitingOnly.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Exiting" });
    await waitFor(() => exitingOnly.get(exitingSession.id)?.status === "exited" || exitingOnly.get(exitingSession.id)?.status === "disconnected");
    expect(closeOwnedResources).toHaveBeenCalled();
    await exitingOnly.close();

    const sessions = managerWithProviders([
      { id: "exit", label: "Exiting", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "exit" } },
      { id: "healthy", label: "Healthy", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "prompt" } },
    ], () => undefined);
    const exiting = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "exit", title: "Exiting" });
    const healthy = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "healthy", title: "Healthy" });
    await waitFor(() => sessions.get(exiting.id)?.status === "exited" || sessions.get(exiting.id)?.status === "disconnected");
    expect(sessions.get(healthy.id)?.status).toBe("live");
    await sessions.close();

    const invalid = manager("bad-protocol", () => undefined);
    await expect(invalid.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Invalid" })).rejects.toMatchObject({ statusCode: 503 });
    await invalid.close();
  });

  it("keeps an exited status when the provider dies during a prompt", async () => {
    const sessions = manager("exit-prompt", () => undefined);
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Exit during prompt" });
    await sessions.prompt(session.id, { text: "Exit now" });
    expect(sessions.get(session.id)?.status).toBe("exited");
    await sessions.close();
  });
});

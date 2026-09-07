import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AcpProviderPreference, AcpServerEvent } from "@ainide/shared";
import { describe, expect, it, vi } from "vitest";
import type { AinideConfig } from "../config.js";
import { type AcpResourceHandlers, AcpSessionManager } from "./manager.js";

function fakeProviderScript(): string {
  return [
    "const fs = require('node:fs');",
    "if (process.env.ACP_SPAWN_LOG) { try { fs.appendFileSync(process.env.ACP_SPAWN_LOG, 'spawn\\n'); } catch {} }",
    "const readline = require('node:readline');",
    "const mode = process.env.ACP_TEST_MODE || 'prompt';",
    "const optionsFor = (configId, value) => mode === 'dynamic-config' ? [{ type: 'select', id: 'model', name: 'Model', currentValue: configId === 'model' ? value : 'default', options: [{ value: 'default', name: 'Default' }, { value: 'fast', name: 'Fast' }] }, { type: 'select', id: 'effort', name: 'Effort', currentValue: configId === 'effort' ? value : 'low', options: configId === 'model' && value === 'fast' ? [{ value: 'low', name: 'Low' }] : [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }] }] : [{ type: 'boolean', id: 'thinking', name: 'Thinking', currentValue: configId === 'thinking' ? value : true }];",
    "const rl = readline.createInterface({ input: process.stdin });",
    "let activePromptId;",
    "let newSessionCount = 0;",
    "const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');",
    "const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\\n');",
    "const update = (sessionId, text, messageId = 'message-1') => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', messageId, content: { type: 'text', text } } } }) + '\\n');",
    "const commands = (sessionId, availableCommands) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: { sessionUpdate: 'available_commands_update', availableCommands } } }) + '\\n');",
    "const logMethod = (method) => { if (process.env.ACP_METHOD_LOG && ['session/new', 'session/load', 'session/close'].includes(method)) { try { fs.appendFileSync(process.env.ACP_METHOD_LOG, method + '\\n'); } catch {} } };",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line);",
    "  logMethod(message.method);",
    "  if (message.method === 'initialize') {",
    "    send(message.id, { protocolVersion: mode === 'bad-protocol' ? 99 : 1, agentCapabilities: mode === 'non-resumable' ? { sessionCapabilities: {} } : { loadSession: true, sessionCapabilities: { resume: {}, close: {}, ...((mode === 'list' || mode === 'list-slow') ? { list: {} } : {}) } }, authMethods: mode === 'auth' ? [{ id: 'local', name: 'Local login' }] : [] });",
    "  } else if (message.method === 'authenticate') { process.env.ACP_AUTHENTICATED = 'true'; send(message.id, {}); }",
    "  else if (message.method === 'session/new') {",
    "    if (mode === 'stderr') fail(message.id, -32001, 'API_KEY=' + process.env.API_KEY);",
    "    else if (mode === 'auth' && !process.env.ACP_AUTHENTICATED) fail(message.id, -32000, 'Authentication required');",
     "    else { process.env.ACP_AUTHENTICATED = 'true'; newSessionCount += 1; const sessionId = newSessionCount === 1 ? 'provider-session-1' : 'provider-session-' + newSessionCount; send(message.id, { sessionId, configOptions: optionsFor() }); const titlePatch = (title) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: { sessionUpdate: 'session_info_update', title } } }) + '\\n'); if (mode === 'rollover-title' && newSessionCount === 1) setTimeout(() => titlePatch('Generated title'), 0); if (mode === 'commands' || mode === 'commands-dynamic') setTimeout(() => commands(sessionId, [{ name: 'plan', description: 'Create a plan', input: { hint: 'what to plan' } }, { name: 'skill', description: 'Run a skill' }]), 0); if (mode === 'commands-dynamic') { setTimeout(() => commands(sessionId, [{ name: 'review', description: 'Review changes' }]), 50); setTimeout(() => commands(sessionId, []), 100); } if (mode === 'title') { setTimeout(() => titlePatch('Generated title'), 0); if (newSessionCount === 1) setTimeout(() => titlePatch('Provider follow-up'), 100); } if (mode === 'exit') setTimeout(() => process.exit(7), 20); }",
      "  } else if (message.method === 'session/load') {",
      "    if (mode === 'load-fail') { fail(message.id, -32001, 'Cannot load the requested session'); return; }",
      "    if (mode === 'load-replay') { update('provider-session-1', 'replayed one', 'replay-1'); update('provider-session-1', 'replayed two', 'replay-2'); }",
      "    send(message.id, { configOptions: optionsFor() }); if (mode === 'title') setTimeout(() => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'provider-session-1', update: { sessionUpdate: 'session_info_update', title: 'Provider restored' } } }) + '\\n'), 0); }",
     "  else if (message.method === 'session/list') { if (mode === 'list-slow') return; send(message.id, { sessions: process.env.ACP_LIST_FIXTURE ? JSON.parse(process.env.ACP_LIST_FIXTURE) : [] }); }",
    "  else if (message.method === 'session/set_config_option') { if (mode === 'reject-config') fail(message.id, -32001, 'Configuration rejected'); else send(message.id, { configOptions: optionsFor(message.params.configId, message.params.value) }); }",
    "  else if (message.method === 'session/close') send(message.id, {});",
    "  else if (message.method === 'session/cancel') { if (mode !== 'close-pending' && mode !== 'cancel-ignored') send(activePromptId, { stopReason: 'cancelled' }); }",
    "  else if (message.method === 'session/prompt') {",
    "    activePromptId = message.id;",
    "    if (mode === 'subagent-invalid') { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'provider-session-1', update: { sessionUpdate: 'subagent_update', subagent: { id: 'missing-provider', state: 'running', token: 'secret' } } } }) + '\\n'); send(activePromptId, { stopReason: 'end_turn' }); }",
    "    else if (mode === 'subagent') { const emit = (id, state, activity) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'provider-session-1', update: { sessionUpdate: 'subagent_update', subagent: { providerId: 'fake', id, ...(id === 'worker-1' ? { name: 'Indexer' } : { role: 'tests' }), ...(activity ? { activity } : {}), state } } } }) + '\\n'); emit('worker-1', 'running', 'Scanning'); emit('worker-2', 'running', 'Testing'); setTimeout(() => emit('worker-1', 'completed'), 5); send(activePromptId, { stopReason: 'end_turn' }); }",
    "    else if (mode === 'failure') fail(message.id, -32001, 'Provider turn failed');",
    "    else if (mode === 'exit-prompt') setTimeout(() => process.exit(8), 20);",
    "    else if (mode === 'cancel-ignored') setTimeout(() => send(activePromptId, { stopReason: 'end_turn' }), 250);",
    "    else if (mode === 'bad-resource') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 101, method: 'fs/read_text_file', params: { sessionId: 'wrong-session', path: '/tmp/secret' } }) + '\\n');",
    "    else if (mode === 'elicitation') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'elicitation/create', params: { mode: 'form', sessionId: 'provider-session-1', message: 'What is your name?', requestedSchema: { type: 'object', properties: { name: { type: 'string', title: 'Name' } }, required: ['name'] } } }) + '\\n');",
    "    else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'session/request_permission', params: { sessionId: 'provider-session-1', toolCall: { toolCallId: 'tool-1', title: 'Run command', status: 'pending' }, options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }] } }) + '\\n');",
    "  } else if (message.id === 100) { update('provider-session-1', mode === 'elicitation' ? 'elicitation accepted' : 'permission granted'); if (mode === 'elicitation') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'elicitation/complete', params: { elicitationId: 'url-elicitation-1' } }) + '\\n'); send(activePromptId, { stopReason: 'end_turn' }); }",
    "  else if (message.id === 101) { update('provider-session-1', message.error ? 'resource denied' : 'resource allowed'); send(activePromptId, { stopReason: 'end_turn' }); }",
    "});",
  ].join("\n");
}

function manager(mode: string, onEvent: (event: AcpServerEvent) => void, resources?: AcpResourceHandlers, initialPreferences?: AcpProviderPreference[]): AcpSessionManager {
  const config: AinideConfig = {
    acpAgents: [{
      id: "fake",
      label: "Fake provider",
      command: process.execPath,
      args: ["-e", fakeProviderScript()],
       env: { ACP_TEST_MODE: mode, API_KEY: "redact-me" },
    }],
  };
  return new AcpSessionManager({ config, onEvent, resources, initialPreferences });
}

function managerWithProviders(providers: NonNullable<AinideConfig["acpAgents"]>, onEvent: (event: AcpServerEvent) => void, initialPreferences?: AcpProviderPreference[]): AcpSessionManager {
  return new AcpSessionManager({ config: { acpAgents: providers }, onEvent, initialPreferences });
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
      expect.objectContaining({ type: "message", role: "user", text: "Make the change", format: "markdown" }),
      expect.objectContaining({ type: "message", role: "agent", text: "permission granted", format: "markdown" }),
      expect.objectContaining({ type: "turn", status: "completed" }),
    ]));
    await sessions.close();
  });

  it("keeps provider subagents associated with independent parent sessions", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("subagent", (event) => events.push(event));
    const first = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "First parent" });
    const second = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Second parent" });
    await Promise.all([sessions.prompt(first.id, { text: "First" }), sessions.prompt(second.id, { text: "Second" })]);
    await waitFor(() => events.filter((event) => event.type === "session_event" && event.event.type === "subagent").length >= 6);

    expect(sessions.list("project-1")).toHaveLength(2);
    expect(sessions.get(first.id)?.subagents).toEqual([
      { providerId: "fake", id: "worker-1", name: "Indexer", activity: "Scanning", state: "completed" },
      { providerId: "fake", id: "worker-2", role: "tests", activity: "Testing", state: "running" },
    ]);
    expect(sessions.get(second.id)?.subagents).toEqual([
      { providerId: "fake", id: "worker-1", name: "Indexer", activity: "Scanning", state: "completed" },
      { providerId: "fake", id: "worker-2", role: "tests", activity: "Testing", state: "running" },
    ]);
    const snapshot = sessions.snapshot("project-1");
    expect(snapshot.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.id, subagents: expect.any(Array) }),
      expect.objectContaining({ id: second.id, subagents: expect.any(Array) }),
    ]));
    expect(sessions.descriptors("project-1")).not.toEqual(expect.arrayContaining([expect.objectContaining({ subagents: expect.anything() })]));
    expect(events.filter((event) => event.type === "session_event" && event.event.type === "subagent").every((event) => event.type !== "session_event" || event.sessionId === first.id || event.sessionId === second.id)).toBe(true);
    await sessions.close();
  });

  it("keeps malformed subagent updates as sanitized unknown activity", async () => {
    const events: AcpServerEvent[] = [];
    let resourceCalls = 0;
    const sessions = manager("subagent-invalid", (event) => events.push(event), {
      readTextFile: async () => { resourceCalls += 1; return { content: "" }; },
    });
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Malformed" });
    await sessions.prompt(session.id, { text: "Malformed worker" });
    await waitFor(() => sessions.history(session.id).some((activity) => activity.type === "unknown" && activity.name === "subagent_update"));
    expect(sessions.get(session.id)?.subagents).toEqual([]);
    expect(sessions.list("project-1")).toHaveLength(1);
    const unknown = sessions.history(session.id).find((activity) => activity.type === "unknown");
    expect(unknown).toEqual({ type: "unknown", name: "subagent_update", data: { sessionUpdate: "subagent_update", subagent: { id: "missing-provider", state: "running" } } });
    expect(resourceCalls).toBe(0);
    await sessions.close();
  });

  it("keeps providers without subagent data and ordinary tools subagent-free", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("prompt", (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "No subagents" });
    const prompt = sessions.prompt(session.id, { text: "Only a tool" });
    await waitFor(() => sessions.get(session.id)?.pendingRequests.length === 1);
    const request = events.find((event): event is Extract<AcpServerEvent, { type: "session_event" }> => event.type === "session_event" && event.sessionId === session.id && event.event.type === "request");
    if (!request || request.event.type !== "request") throw new Error("permission request was not emitted");
    sessions.respondToRequest(session.id, request.event.request.request.requestId, { outcome: "selected", optionId: "allow" });
    await prompt;
    expect(sessions.get(session.id)?.subagents).toEqual([]);
    expect(events.some((event) => event.type === "session_event" && event.event.type === "subagent")).toBe(false);
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

  it("stores advertised commands on the session instead of its activity history", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("commands", (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Commands" });

    await waitFor(() => sessions.get(session.id)?.availableCommands.length === 2);
    expect(sessions.get(session.id)?.availableCommands).toEqual([
      { name: "plan", description: "Create a plan", inputHint: "what to plan" },
      { name: "skill", description: "Run a skill" },
    ]);
    expect(sessions.history(session.id)).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "available_commands_update" })]));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "session_event", event: expect.objectContaining({ type: "status", session: expect.objectContaining({ availableCommands: expect.any(Array) }) }) }),
    ]));
    await sessions.close();
  });

  it("replaces and clears advertised commands when the provider changes them", async () => {
    const sessions = manager("commands-dynamic", () => undefined);
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Dynamic commands" });

    await waitFor(() => sessions.get(session.id)?.availableCommands.length === 2);
    await waitFor(() => sessions.get(session.id)?.availableCommands[0]?.name === "review");
    expect(sessions.get(session.id)?.availableCommands).toEqual([{ name: "review", description: "Review changes" }]);
    await waitFor(() => sessions.get(session.id)?.availableCommands.length === 0);
    await sessions.close();
  });

  it("starts without a title and accepts provider title updates until the user renames it", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("title", (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake" });

    expect(session).toMatchObject({ title: "Fake provider", titleSource: "provider" });
    await waitFor(() => sessions.get(session.id)?.title === "Generated title");
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "session_event", event: expect.objectContaining({ type: "status", session: expect.objectContaining({ title: "Generated title", titleSource: "provider" }) }) })]));
    expect(sessions.descriptors("project-1")[0]).toMatchObject({ title: "Generated title", titleSource: "provider" });

    expect(sessions.rename(session.id, "My session")).toMatchObject({ title: "My session", titleSource: "user" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(sessions.get(session.id)).toMatchObject({ title: "My session", titleSource: "user" });
    await sessions.close();
  });

  it("preserves user-owned titles when restoring a provider session that advertises a new title", async () => {
    const sessions = manager("title", () => undefined);
    const restored = await sessions.restore("project-1", process.cwd(), [{
      id: "user-owned-session",
      title: "My renamed session",
      titleSource: "user",
      providerId: "fake",
      acpSessionId: "provider-session-1",
      resumability: "resumable",
    }]);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(restored[0]).toMatchObject({ title: "My renamed session", titleSource: "user" });
    expect(sessions.get("user-owned-session")).toMatchObject({ title: "My renamed session", titleSource: "user" });
    await sessions.close();
  });

  it("remembers successful configuration changes per provider", async () => {
    const sessions = managerWithProviders([
      { id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "prompt" } },
      { id: "other", label: "Other provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "prompt" } },
    ], () => undefined, [{ providerId: "fake", values: { thinking: false } }]);
    const fake = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Remembered" });
    const other = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "other", title: "Default" });

    expect(fake.configOptions[0]?.currentValue).toBe(false);
    expect(other.configOptions[0]?.currentValue).toBe(true);
    await sessions.setConfigOption(fake.id, "thinking", true);
    expect(sessions.providerPreferences()).toEqual([{ providerId: "fake", values: { thinking: true } }]);
    await sessions.close();
  });

  it("does not replace a remembered value when the provider rejects it", async () => {
    const sessions = manager("reject-config", () => undefined, undefined, [{ providerId: "fake", values: { thinking: false } }]);
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Rejected" });

    expect(session.configOptions[0]?.currentValue).toBe(true);
    await expect(sessions.setConfigOption(session.id, "thinking", false)).rejects.toThrow("Configuration rejected");
    expect(sessions.providerPreferences()).toEqual([{ providerId: "fake", values: { thinking: false } }]);
    await sessions.close();
  });

  it("revalidates preferences after dynamic option updates and skips stale values", async () => {
    const sessions = manager("dynamic-config", () => undefined, undefined, [{ providerId: "fake", values: { model: "fast", effort: "high", missing: "value" } }]);
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Dynamic config" });

    expect(session.status).toBe("live");
    expect(session.configOptions).toEqual([
      expect.objectContaining({ id: "model", currentValue: "fast" }),
      expect.objectContaining({ id: "effort", currentValue: "low", choices: [{ value: "low", label: "Low" }] }),
    ]);
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

  it("applies remembered configuration after authentication creates a session", async () => {
    const sessions = manager("auth", () => undefined, undefined, [{ providerId: "fake", values: { thinking: false } }]);
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Auth config" });

    expect(session.status).toBe("auth_required");
    const authenticated = await sessions.authenticate(session.id, "local");
    expect(authenticated.configOptions[0]?.currentValue).toBe(false);
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
    const sessions = manager("restore", () => undefined, undefined, [{ providerId: "fake", values: { thinking: false } }]);
    const restored = await sessions.restore("project-1", process.cwd(), [{
      id: "local-session-1",
       title: "Restored session",
       titleSource: "user",
      providerId: "fake",
      acpSessionId: "provider-session-1",
      resumability: "resumable",
    }]);

    expect(restored[0]).toMatchObject({ id: "local-session-1", status: "live", resumability: "restored" });
    expect(restored[0]?.configOptions).toEqual([expect.objectContaining({ id: "thinking", currentValue: true })]);
    const fresh = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Fresh session" });
    expect(fresh.configOptions[0]?.currentValue).toBe(false);
    await sessions.close();
  });

  it("loads a selected provider session, replays its transcript, and persists the loaded id", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("load-replay", (event) => events.push(event));
    const created = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Resumed", acpSessionId: "provider-session-1" });

    expect(created).toMatchObject({ id: expect.any(String), status: "live", acpSessionId: "provider-session-1", resumability: "resumable" });
    expect(created.configOptions).toEqual([expect.objectContaining({ id: "thinking" })]);
    expect(sessions.history(created.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "message", role: "agent", text: "replayed one" }),
      expect.objectContaining({ type: "message", role: "agent", text: "replayed two" }),
    ]));
    expect(sessions.descriptors("project-1")).toEqual([expect.objectContaining({ id: created.id, title: "Resumed", providerId: "fake", acpSessionId: "provider-session-1", resumability: "resumable", titleSource: "user" })]);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "session_event", event: expect.objectContaining({ type: "status" }) })]));
    await sessions.close();
  });

  it("returns an already-live session when the same provider session is resumed again", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ainide-dedupe-"));
    const spawnLog = path.join(directory, "spawn.log");
    await writeFile(spawnLog, "");
    const sessions = managerWithProviders([
      { id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "restore", ACP_SPAWN_LOG: spawnLog } },
    ], () => undefined);
    const first = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Resume", acpSessionId: "provider-session-1" });
    const second = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Resume again", acpSessionId: "provider-session-1" });

    expect(second.id).toBe(first.id);
    expect(second.title).toBe("Resume");
    expect((await readFile(spawnLog, "utf8")).trim().split("\n")).toHaveLength(1);
    expect(sessions.list()).toHaveLength(1);
    await sessions.close();
  });

  it("fails a provider session load loudly without keeping a dead session", async () => {
    const sessions = manager("load-fail", () => undefined);
    const error = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Broken", acpSessionId: "provider-session-1" }).then(() => undefined, (reason) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Cannot load the requested session");
    expect(sessions.list()).toEqual([]);
    await sessions.close();
  });

  it("rejects resuming without a usable provider session id", async () => {
    const sessions = manager("restore", () => undefined);
    await expect(sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Empty", acpSessionId: "   " })).rejects.toMatchObject({ statusCode: 400 });
    await expect(sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Long", acpSessionId: "x".repeat(201) })).rejects.toMatchObject({ statusCode: 400 });
    expect(sessions.list()).toEqual([]);
    await sessions.close();
  });

  it("rolls a live session over to a new provider context on the same process", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ainide-rollover-"));
    const methodLog = path.join(directory, "methods.log");
    await writeFile(methodLog, "");
    const events: AcpServerEvent[] = [];
    const sessions = managerWithProviders([
      { id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "prompt", ACP_METHOD_LOG: methodLog } },
    ], (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Roll target" });
    const prompt = sessions.prompt(session.id, { text: "Populate history" });
    await waitFor(() => sessions.get(session.id)?.status === "waiting");
    const request = events.find((event): event is Extract<AcpServerEvent, { type: "session_event" }> => event.type === "session_event" && event.event.type === "request");
    if (request?.event.type !== "request") throw new Error("permission request was not emitted");
    sessions.respondToRequest(session.id, request.event.request.request.requestId, { outcome: "selected", optionId: "allow" });
    await prompt;
    expect(sessions.history(session.id).length).toBeGreaterThan(0);

    const rolled = await sessions.rollover(session.id);

    expect(rolled).toMatchObject({ id: session.id, acpSessionId: "provider-session-2", status: "live", title: "Roll target", titleSource: "user" });
    expect(sessions.history(session.id)).toEqual([]);
    expect(await readFile(methodLog, "utf8")).toBe(["session/new", "session/new", "session/close", ""].join("\n"));
    await sessions.close();
  });
  it("rolls over without calling provider close when close support is not advertised", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ainide-rollover-noclose-"));
    const methodLog = path.join(directory, "methods.log");
    await writeFile(methodLog, "");
    const sessions = managerWithProviders([
      { id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "non-resumable", ACP_METHOD_LOG: methodLog } },
    ], () => undefined);
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "No close" });
    const rolled = await sessions.rollover(session.id);

    expect(rolled).toMatchObject({ id: session.id, acpSessionId: "provider-session-2", status: "live" });
    expect(await readFile(methodLog, "utf8")).toBe(["session/new", "session/new", ""].join("\n"));
    await sessions.close();
  });

  it("clears history and reverts only provider-derived titles on rollover", async () => {
    const sessions = managerWithProviders([
      { id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "rollover-title" } },
    ], () => undefined);
    const derived = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake" });
    await waitFor(() => sessions.get(derived.id)?.title === "Generated title");

    const rolled = await sessions.rollover(derived.id);
    expect(rolled).toMatchObject({ title: "Fake provider", titleSource: "provider" });
    expect(sessions.get(derived.id)).toMatchObject({ title: "Fake provider", titleSource: "provider" });
    await sessions.close();
  });

  it("rejects rollover while a prompt is active or the session needs authentication", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("prompt", (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Roll guard" });
    const prompt = sessions.prompt(session.id, { text: "Busy" });
    await waitFor(() => sessions.get(session.id)?.status === "waiting");
    await expect(sessions.rollover(session.id)).rejects.toMatchObject({ statusCode: 409, message: "Cancel the active prompt first" });
    const request = events.find((event): event is Extract<AcpServerEvent, { type: "session_event" }> => event.type === "session_event" && event.event.type === "request");
    if (request?.event.type !== "request") throw new Error("permission request was not emitted");
    sessions.respondToRequest(session.id, request.event.request.request.requestId, { outcome: "selected", optionId: "allow" });
    await prompt;

    const authSessions = manager("auth", () => undefined);
    const authSession = await authSessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Auth" });
    await expect(authSessions.rollover(authSession.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(authSessions.get(authSession.id)).toMatchObject({ status: "auth_required" });
    expect(authSessions.get(authSession.id)?.acpSessionId).toBeUndefined();
    await sessions.close();
    await authSessions.close();
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

  it("publishes one cancelled turn before an ignored provider finalizes", async () => {
    const events: AcpServerEvent[] = [];
    const sessions = manager("cancel-ignored", (event) => events.push(event));
    const session = await sessions.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Delayed cancellation" });
    const prompt = sessions.prompt(session.id, { text: "Cancel while the provider keeps working" });

    await waitFor(() => sessions.get(session.id)?.activePrompt === true);
    await sessions.cancel(session.id);

    expect(sessions.history(session.id)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "turn", status: "cancelled" })]));
    expect(events.filter((event) => event.type === "session_event" && event.sessionId === session.id && event.event.type === "activity" && event.event.activity.type === "turn" && event.event.activity.status === "cancelled")).toHaveLength(1);

    await prompt;
    expect(sessions.history(session.id).filter((activity) => activity.type === "turn")).toEqual([{ type: "turn", status: "cancelled" }]);
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
       titleSource: "user",
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
       titleSource: "user",
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
       titleSource: "user",
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

  it("omits project-disabled providers for that project but keeps them for others and in the full list", () => {
    const config: AinideConfig = {
      acpAgents: [
        { id: "cursor", label: "Cursor", command: "cursor", args: ["acp"] },
        { id: "opencode", label: "OpenCode", command: "opencode", args: ["acp"] },
        { id: "gemini", label: "Gemini", command: "gemini", args: ["acp"] },
      ],
      projects: new Map([["/project-a", { disabledAgents: ["gemini"], buildCommands: [] }]]),
    };
    const sessions = new AcpSessionManager({ config, onEvent: () => undefined });

    expect(sessions.providers("/project-a").map((provider) => provider.id)).toEqual(["cursor", "opencode"]);
    expect(sessions.providers("/project-b").map((provider) => provider.id)).toEqual(["cursor", "opencode", "gemini"]);
    expect(sessions.providers().map((provider) => provider.id)).toEqual(["cursor", "opencode", "gemini"]);
  });

  it("maps the session listing capability from the initialize response", async () => {    const listing = manager("list", () => undefined);
    const listed = await listing.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Listing" });
    expect(listed.capabilities.canList).toBe(true);
    await listing.close();

    const plain = manager("prompt", () => undefined);
    const created = await plain.create({ projectId: "project-1", rootPath: process.cwd(), providerId: "fake", title: "Plain" });
    expect(created.capabilities.canList).toBe(false);
    await plain.close();
  });

  it("lists provider sessions for the active workspace with sanitized bounded output", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "ainide-list-"));
    const fixture = [
      { sessionId: "s-other", cwd: "/elsewhere", title: "Other workspace", updatedAt: "2026-01-16T00:00:00Z" },
      { sessionId: "s-recent", cwd: workspace, title: "Recent session", updatedAt: "2026-01-15T10:00:00Z" },
      { sessionId: "s-older", cwd: workspace, title: "  Old   session\u0007 ", updatedAt: "2026-01-02T10:00:00Z" },
      { sessionId: "", cwd: workspace, title: "No id" },
      { sessionId: "s-long", cwd: workspace, title: `x${"y".repeat(300)}`, updatedAt: "2026-01-10T00:00:00Z" },
      { sessionId: "s-untitled", cwd: workspace, title: null, updatedAt: "not-a-date" },
    ];
    const sessions = new AcpSessionManager({
      config: { acpAgents: [{ id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "list", ACP_LIST_FIXTURE: JSON.stringify(fixture) } }] },
      onEvent: () => undefined,
    });
    const result = await sessions.listProviderSessions("fake", workspace);

    expect(result.available).toBe(true);
    expect(result.sessions).toEqual([
      { sessionId: "s-recent", title: "Recent session", updatedAt: "2026-01-15T10:00:00.000Z" },
      { sessionId: "s-long", title: `x${"y".repeat(119)}`, updatedAt: "2026-01-10T00:00:00.000Z" },
      { sessionId: "s-older", title: "Old session", updatedAt: "2026-01-02T10:00:00.000Z" },
      { sessionId: "s-untitled" },
    ]);
    await sessions.close();
  });

  it("bounds the provider session list to the newest entries", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "ainide-bound-"));
    const fixture = Array.from({ length: 24 }, (_, index) => ({
      sessionId: `bulk-${index}`,
      cwd: workspace,
      title: `Bulk ${index}`,
      updatedAt: new Date(Date.parse("2026-03-01T00:00:00Z") - index * 60_000).toISOString(),
    }));
    fixture.push({ sessionId: "s-other", cwd: "/elsewhere", title: "Other", updatedAt: "2027-01-01T00:00:00Z" });
    const sessions = new AcpSessionManager({
      config: { acpAgents: [{ id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "list", ACP_LIST_FIXTURE: JSON.stringify(fixture) } }] },
      onEvent: () => undefined,
    });
    const result = await sessions.listProviderSessions("fake", workspace);

    expect(result.sessions).toHaveLength(20);
    expect(result.sessions.map((summary) => summary.sessionId)).toEqual(Array.from({ length: 20 }, (_, index) => `bulk-${index}`));
    await sessions.close();
  });

  it("caches successful provider session listings and deduplicates in-flight requests", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ainide-cache-"));
    const spawnLog = path.join(directory, "spawn.log");
    await writeFile(spawnLog, "");
    const workspace = await mkdtemp(path.join(os.tmpdir(), "ainide-cache-ws-"));
    const makeManager = () => new AcpSessionManager({
      config: { acpAgents: [{ id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "list", ACP_LIST_FIXTURE: JSON.stringify([{ sessionId: "s-1", cwd: workspace, title: "One", updatedAt: "2026-01-01T00:00:00Z" }]), ACP_SPAWN_LOG: spawnLog } }] },
      onEvent: () => undefined,
    });
    const sequential = makeManager();
    await sequential.listProviderSessions("fake", workspace);
    await sequential.listProviderSessions("fake", workspace);
    expect((await readFile(spawnLog, "utf8")).trim().split("\n")).toHaveLength(1);
    await sequential.close();

    const concurrentLog = path.join(directory, "concurrent.log");
    await writeFile(concurrentLog, "");
    const concurrent = new AcpSessionManager({
      config: { acpAgents: [{ id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "list", ACP_LIST_FIXTURE: JSON.stringify([{ sessionId: "s-1", cwd: workspace, title: "One", updatedAt: "2026-01-01T00:00:00Z" }]), ACP_SPAWN_LOG: concurrentLog } }] },
      onEvent: () => undefined,
    });
    await Promise.all([concurrent.listProviderSessions("fake", workspace), concurrent.listProviderSessions("fake", workspace)]);
    expect((await readFile(concurrentLog, "utf8")).trim().split("\n")).toHaveLength(1);
    await concurrent.close();
  });

  it("marks providers without listing support and slow listings as unavailable", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "ainide-unavailable-"));
    const withoutCapability = manager("prompt", () => undefined);
    const started = Date.now();
    await expect(withoutCapability.listProviderSessions("fake", workspace)).resolves.toEqual({ available: false, sessions: [] });
    expect(Date.now() - started).toBeLessThan(3_000);
    await withoutCapability.close();

    const slow = new AcpSessionManager({
      config: { acpAgents: [{ id: "fake", label: "Fake provider", command: process.execPath, args: ["-e", fakeProviderScript()], env: { ACP_TEST_MODE: "list-slow" } }] },
      onEvent: () => undefined,
      listTimeoutMs: 120,
    });
    const begun = Date.now();
    await expect(slow.listProviderSessions("fake", workspace)).resolves.toEqual({ available: false, sessions: [] });
    expect(Date.now() - begun).toBeLessThan(3_000);
    await slow.close();

    const missing = new AcpSessionManager({ config: { acpAgents: [] }, onEvent: () => undefined });
    await expect(missing.listProviderSessions("fake", workspace)).rejects.toMatchObject({ statusCode: 404 });
  });
});

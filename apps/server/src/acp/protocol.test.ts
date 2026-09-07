import type * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { AcpProtocolAdapter } from "./protocol.js";
import { openAcpTransport } from "./transport.js";

function fakeProviderScript(): string {
  return [
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line);",
    "  if (message.method === 'initialize') send(message.id, { protocolVersion: 1, agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {}, close: {} } }, authMethods: [{ id: 'local', name: 'Local login' }] });",
    "  else if (message.method === 'session/new') { send(message.id, { sessionId: 'provider-session-1' }); if (process.env.ACP_TEST_SUBAGENT) setTimeout(() => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'provider-session-1', update: { sessionUpdate: 'subagent_update', subagent: { providerId: 'fake', id: 'worker-1', name: 'Indexer', state: 'running' } } } }) + '\\n'), 0); }",
    "  else if (message.method === 'session/load') send(message.id, {});",
    "  else if (message.method === 'session/close') send(message.id, {});",
    "});",
  ].join("\n");
}

function callbacks(sessionUpdates: acp.SessionNotification[] = []) {
  return {
    sessionUpdate: (params: acp.SessionNotification) => { sessionUpdates.push(params); },
    requestPermission: async () => ({ outcome: { outcome: "cancelled" as const } }),
    readTextFile: async () => ({ content: "" }),
    writeTextFile: async () => undefined,
    createTerminal: async () => ({ terminalId: "terminal" }),
    terminalOutput: async () => ({ output: "", truncated: false }),
    releaseTerminal: async () => undefined,
    waitForTerminalExit: async () => ({}),
    killTerminal: async () => undefined,
    createElicitation: async () => ({ action: "cancel" as const }),
    completeElicitation: async () => undefined,
  };
}

describe("ACP protocol adapter", () => {
  it("delivers the explicitly supported subagent extension around the typed ACP router", async () => {
    const updates: acp.SessionNotification[] = [];
    const transport = openAcpTransport({ command: process.execPath, args: ["-e", fakeProviderScript()], cwd: process.cwd(), env: { ACP_TEST_SUBAGENT: "1" } });
    const adapter = new AcpProtocolAdapter(transport, callbacks(updates));
    adapter.connect();
    await adapter.initialize();
    await adapter.newSession(process.cwd());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates).toEqual([{ sessionId: "provider-session-1", update: { sessionUpdate: "subagent_update", subagent: { providerId: "fake", id: "worker-1", name: "Indexer", state: "running" } } }]);
    adapter.close();
    await transport.closed;
  });

  it("negotiates ACP v1 and creates a session through the typed client", async () => {
    const transport = openAcpTransport({ command: process.execPath, args: ["-e", fakeProviderScript()], cwd: process.cwd() });
    const adapter = new AcpProtocolAdapter(transport, callbacks());
    adapter.connect();

    const initialized = await adapter.initialize();
    expect(initialized.protocolVersion).toBe(1);
    expect(initialized.authMethods?.[0]?.id).toBe("local");
    expect(initialized.agentCapabilities?.loadSession).toBe(true);
    await expect(adapter.newSession(process.cwd())).resolves.toEqual({ sessionId: "provider-session-1" });
    await expect(adapter.loadSession("provider-session-1", process.cwd())).resolves.toEqual({});

    adapter.close();
    await expect(transport.closed).resolves.toMatchObject({ code: null });
  });
});

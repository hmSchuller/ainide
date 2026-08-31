import * as acp from "@agentclientprotocol/sdk";
import type { AcpTransport } from "./transport.js";

export interface AcpProtocolCallbacks {
  sessionUpdate: (params: acp.SessionNotification) => Promise<void> | void;
  requestPermission: (params: acp.RequestPermissionRequest, requestId: string) => Promise<acp.RequestPermissionResponse>;
  readTextFile: (params: acp.ReadTextFileRequest) => Promise<acp.ReadTextFileResponse>;
  writeTextFile: (params: acp.WriteTextFileRequest) => Promise<acp.WriteTextFileResponse | void>;
  createTerminal: (params: acp.CreateTerminalRequest) => Promise<acp.CreateTerminalResponse>;
  terminalOutput: (params: acp.TerminalOutputRequest) => Promise<acp.TerminalOutputResponse>;
  releaseTerminal: (params: acp.ReleaseTerminalRequest) => Promise<acp.ReleaseTerminalResponse | void>;
  waitForTerminalExit: (params: acp.WaitForTerminalExitRequest) => Promise<acp.WaitForTerminalExitResponse>;
  killTerminal: (params: acp.KillTerminalRequest) => Promise<acp.KillTerminalResponse | void>;
  createElicitation: (params: acp.CreateElicitationRequest, requestId: string) => Promise<acp.CreateElicitationResponse>;
  completeElicitation: (params: acp.CompleteElicitationNotification) => Promise<void>;
}

export class AcpProtocolAdapter {
  private readonly app: acp.ClientApp;
  private connection?: acp.ClientConnection;
  private initialization?: acp.InitializeResponse;

  constructor(private readonly transport: AcpTransport, callbacks: AcpProtocolCallbacks) {
    this.app = acp.client({ name: "ainide" });
    this.app.onNotification(acp.methods.client.session.update, ({ params }) => callbacks.sessionUpdate(params));
    this.app.onNotification(acp.methods.client.elicitation.complete, ({ params }) => callbacks.completeElicitation(params));
    this.app.onRequest(acp.methods.client.session.requestPermission, ({ params, requestId }) => callbacks.requestPermission(params, String(requestId)));
    this.app.onRequest(acp.methods.client.fs.readTextFile, ({ params }) => callbacks.readTextFile(params));
    this.app.onRequest(acp.methods.client.fs.writeTextFile, ({ params }) => callbacks.writeTextFile(params));
    this.app.onRequest(acp.methods.client.terminal.create, ({ params }) => callbacks.createTerminal(params));
    this.app.onRequest(acp.methods.client.terminal.output, ({ params }) => callbacks.terminalOutput(params));
    this.app.onRequest(acp.methods.client.terminal.release, ({ params }) => callbacks.releaseTerminal(params));
    this.app.onRequest(acp.methods.client.terminal.waitForExit, ({ params }) => callbacks.waitForTerminalExit(params));
    this.app.onRequest(acp.methods.client.terminal.kill, ({ params }) => callbacks.killTerminal(params));
    this.app.onRequest(acp.methods.client.elicitation.create, ({ params, requestId }) => callbacks.createElicitation(params, String(requestId)));
  }

  get initializeResponse(): acp.InitializeResponse | undefined {
    return this.initialization;
  }

  get closed(): Promise<void> {
    return this.requireConnection().closed;
  }

  connect(): void {
    if (this.connection) throw new Error("ACP connection is already open");
    this.connection = this.app.connect(this.transport.stream);
  }

  async initialize(): Promise<acp.InitializeResponse> {
    const response = await this.agent().request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: { name: "ainide", version: "0.1.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
        session: { configOptions: { boolean: {} } },
        plan: {},
        auth: {},
        elicitation: { form: {} },
      },
    });
    this.initialization = response;
    return response;
  }

  authenticate(methodId: string): Promise<acp.AuthenticateResponse> {
    return this.agent().request(acp.methods.agent.authenticate, {methodId});
  }

  newSession(cwd: string): Promise<acp.NewSessionResponse> {
    return this.agent().request(acp.methods.agent.session.new, { cwd, mcpServers: [] });
  }

  loadSession(sessionId: string, cwd: string): Promise<acp.LoadSessionResponse | void> {
    return this.agent().request(acp.methods.agent.session.load, { sessionId, cwd, mcpServers: [] });
  }

  resumeSession(sessionId: string, cwd: string): Promise<acp.ResumeSessionResponse> {
    return this.agent().request(acp.methods.agent.session.resume, { sessionId, cwd, mcpServers: [] });
  }

  setConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<acp.SetSessionConfigOptionResponse> {
    const params = typeof value === "boolean"
      ? { sessionId, configId, type: "boolean" as const, value }
      : { sessionId, configId, value };
    return this.agent().request(acp.methods.agent.session.setConfigOption, params);
  }

  prompt(sessionId: string, prompt: acp.ContentBlock[]): Promise<acp.PromptResponse> {
    return this.agent().request(acp.methods.agent.session.prompt, { sessionId, prompt });
  }

  cancel(sessionId: string): Promise<void> {
    return this.agent().notify(acp.methods.agent.session.cancel, { sessionId });
  }

  closeSession(sessionId: string): Promise<acp.CloseSessionResponse | void> {
    return this.agent().request(acp.methods.agent.session.close, { sessionId });
  }

  close(): void {
    this.connection?.close();
    this.transport.close();
  }

  private agent(): acp.ClientContext {
    return this.requireConnection().agent;
  }

  private requireConnection(): acp.ClientConnection {
    if (!this.connection) throw new Error("ACP connection is not open");
    return this.connection;
  }
}

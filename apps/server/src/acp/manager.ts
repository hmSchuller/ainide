import { randomUUID } from "node:crypto";
import * as acp from "@agentclientprotocol/sdk";
import type {
  AcpActivity,
  AcpAuthMethod,
  AcpConfigOption,
  AcpPendingRequest,
  AcpPromptRequest,
  AcpProviderDescriptor,
  AcpProviderPreference,
  AcpProviderPreferenceValue,
  AcpProviderSessionSummary,
  AcpProviderSessionsResult,
  AcpServerEvent,
  AcpSession,
  AcpSessionCapabilities,
  AcpSessionDescriptor,
  AcpSessionEvent,
  AcpTitleSource,
} from "@ainide/shared";
import { parseAcpProviderPreferences } from "@ainide/shared";
import type { AcpAgentConfig, AinideConfig } from "../config.js";
import { AcpEventLog, appendAcpActivity, normalizeConfigOptions, normalizeElicitationRequest, normalizePermissionRequest, normalizeSessionUpdate, stabilizeCursorMessageChunk } from "./normalize.js";
import { AcpProtocolAdapter, type AcpProtocolCallbacks } from "./protocol.js";
import { type AcpProcessExit, type AcpTransport, openAcpTransport } from "./transport.js";

export type AcpPermissionResponse =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

export type AcpElicitationResponse =
  | { action: "accept"; content?: Record<string, string | number | boolean | string[]> }
  | { action: "decline" | "cancel" };

export type AcpRequestResponse = AcpPermissionResponse | AcpElicitationResponse;

export interface AcpResourceHandlers {
  readTextFile?: (session: AcpSession, params: acp.ReadTextFileRequest) => Promise<acp.ReadTextFileResponse>;
  writeTextFile?: (session: AcpSession, params: acp.WriteTextFileRequest) => Promise<acp.WriteTextFileResponse | void>;
  createTerminal?: (session: AcpSession, params: acp.CreateTerminalRequest) => Promise<acp.CreateTerminalResponse>;
  terminalOutput?: (session: AcpSession, params: acp.TerminalOutputRequest) => Promise<acp.TerminalOutputResponse>;
  releaseTerminal?: (session: AcpSession, params: acp.ReleaseTerminalRequest) => Promise<acp.ReleaseTerminalResponse | void>;
  waitForTerminalExit?: (session: AcpSession, params: acp.WaitForTerminalExitRequest) => Promise<acp.WaitForTerminalExitResponse>;
  killTerminal?: (session: AcpSession, params: acp.KillTerminalRequest) => Promise<acp.KillTerminalResponse | void>;
  closeSession?: (session: AcpSession) => Promise<void> | void;
}

export interface AcpSessionManagerOptions {
  config: AinideConfig;
  onEvent: (event: AcpServerEvent) => void;
  onPersistenceChange?: (projectId: string, descriptors: AcpSessionDescriptor[]) => void | Promise<void>;
  initialPreferences?: AcpProviderPreference[];
  onPreferencesChange?: (preferences: AcpProviderPreference[]) => void | Promise<void>;
  resources?: AcpResourceHandlers;
  maxHistoryItems?: number;
  listTimeoutMs?: number;
  listCacheTtlMs?: number;
}

type PendingResponse = acp.RequestPermissionResponse | acp.CreateElicitationResponse;

type PendingRequest = {
  publicRequest: AcpPendingRequest;
  resolve: (response: PendingResponse) => void;
};

type LiveAcpSession = {
  public: AcpSession;
  rootPath: string;
  provider: AcpAgentConfig;
  transport?: AcpTransport;
  adapter?: AcpProtocolAdapter;
  connectionClosed?: Promise<void>;
  log: AcpEventLog;
  history: AcpActivity[];
  pending: Map<string, PendingRequest>;
  closing: boolean;
  exitHandled: boolean;
};

export type AcpProviderSessionList = AcpProviderSessionsResult;

const DEFAULT_CAPABILITIES: AcpSessionCapabilities = {
  canCancel: true,
  canClose: false,
  canLoad: false,
  canList: false,
  canResume: false,
  canSetConfig: false,
  canReadTextFile: true,
  canWriteTextFile: true,
  canUseTerminal: true,
  canRequestPermission: true,
  canElicit: true,
};

const MAX_PROMPT_TEXT = 1_000_000;
const MAX_PROMPT_CONTEXT_ITEMS = 100;
const MAX_PROVIDER_SESSIONS = 20;
const MAX_PROVIDER_SESSION_TITLE = 120;
const MAX_PROVIDER_SESSION_ID = 200;
const LIVE_SESSION_STATUSES = new Set(["connecting", "auth_required", "live", "waiting"]);

export class AcpSessionError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = "AcpSessionError";
  }
}

export class AcpSessionManager {
  private readonly sessions = new Map<string, LiveAcpSession>();
  private readonly providerPreferenceValues = new Map<string, Map<string, AcpProviderPreferenceValue>>();
  private readonly listCache = new Map<string, { expiresAt: number; value: AcpProviderSessionList }>();
  private readonly listInFlight = new Map<string, Promise<AcpProviderSessionList>>();
  private readonly maxHistoryItems: number;
  private readonly listTimeoutMs: number;
  private readonly listCacheTtlMs: number;

  constructor(private readonly options: AcpSessionManagerOptions) {
    this.maxHistoryItems = options.maxHistoryItems ?? 2_000;
    this.listTimeoutMs = options.listTimeoutMs ?? 10_000;
    this.listCacheTtlMs = options.listCacheTtlMs ?? 30_000;
    for (const preference of parseAcpProviderPreferences(options.initialPreferences) ?? []) this.providerPreferenceValues.set(preference.providerId, new Map(Object.entries(preference.values)));
  }

  providers(rootPath?: string): AcpProviderDescriptor[] {
    const disabled = rootPath ? this.options.config.projects?.get(rootPath)?.disabledAgents : undefined;
    const disabledIds = disabled ? new Set(disabled) : new Set<string>();
    return (this.options.config.acpAgents ?? [])
      .filter(({ id }) => !disabledIds.has(id))
      .map(({ id, label }) => ({ id, label }));
  }

  list(projectId?: string): AcpSession[] {
    return [...this.sessions.values()]
      .filter((record) => projectId === undefined || record.public.projectId === projectId)
      .map((record) => cloneSession(record.public));
  }

  get(id: string): AcpSession | undefined {
    const record = this.sessions.get(id);
    return record ? cloneSession(record.public) : undefined;
  }

  history(id: string): AcpActivity[] {
    return this.sessions.get(id)?.history.map((activity) => ({ ...activity })) ?? [];
  }

  snapshot(projectId: string): { type: "snapshot"; projectId: string; sessions: AcpSession[]; history: Record<string, AcpActivity[]>; sequence: number; sequences: Record<string, number> } {
    const records = [...this.sessions.values()].filter((record) => record.public.projectId === projectId);
    return {
      type: "snapshot",
      projectId,
      sessions: records.map((record) => cloneSession(record.public)),
      history: Object.fromEntries(records.map((record) => [record.public.id, record.history.map((activity) => ({ ...activity }))])),
      sequence: records.reduce((maximum, record) => Math.max(maximum, record.log.currentSequence), 0),
      sequences: Object.fromEntries(records.map((record) => [record.public.id, record.log.currentSequence])),
    };
  }

  eventHistory(id: string): ReturnType<LiveAcpSession["log"]["history"]> {
    return this.sessions.get(id)?.log.history() ?? [];
  }

  descriptors(projectId: string): AcpSessionDescriptor[] {
    return [...this.sessions.values()]
      .filter((record) => record.public.projectId === projectId)
      .flatMap((record) => {
        const descriptor = descriptorFor(record);
        return descriptor ? [descriptor] : [];
      });
  }

  providerPreferences(): AcpProviderPreference[] {
    return [...this.providerPreferenceValues.entries()].map(([providerId, values]) => ({ providerId, values: Object.fromEntries(values) }));
  }

  async listProviderSessions(providerId: string, rootPath: string): Promise<AcpProviderSessionList> {
    const provider = this.provider(providerId);
    if (!provider) throw new AcpSessionError(404, "Configured ACP provider not found");
    if (!rootPath) throw new AcpSessionError(409, "Open a workspace before listing ACP sessions");
    const key = `${providerId}\u0000${rootPath}`;
    const cached = this.listCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.listCache.delete(key);
    const inFlight = this.listInFlight.get(key);
    if (inFlight) return inFlight;
    const listing = this.transientProviderSessions(provider, rootPath)
      .then((value) => {
        this.listCache.set(key, { expiresAt: Date.now() + this.listCacheTtlMs, value });
        return value;
      })
      .finally(() => {
        this.listInFlight.delete(key);
      });
    this.listInFlight.set(key, listing);
    return listing;
  }

  private async transientProviderSessions(provider: AcpAgentConfig, rootPath: string): Promise<AcpProviderSessionList> {
    if (!provider.command) return { available: false, sessions: [] };
    let transport: AcpTransport | undefined;
    try {
      transport = openAcpTransport({ command: provider.command, args: provider.args, cwd: rootPath, env: provider.env });
      const adapter = new AcpProtocolAdapter(transport, transientCallbacks());
      adapter.connect();
      const initialized = await withTimeout(adapter.initialize(), this.listTimeoutMs);
      if (initialized.protocolVersion !== acp.PROTOCOL_VERSION) return { available: false, sessions: [] };
      if (!capabilitiesFor(initialized).canList) return { available: false, sessions: [] };
      const listed = await withTimeout(adapter.listSessions(rootPath), this.listTimeoutMs);
      return { available: true, sessions: summarizeProviderSessions(listed.sessions, rootPath) };
    } catch {
      // A slow or broken provider degrades to "resume unavailable" without blocking the picker.
      return { available: false, sessions: [] };
    } finally {
      transport?.close();
      if (transport) await transport.closed.catch(() => undefined);
    }
  }

  async create(input: { projectId: string; rootPath: string; providerId: string; title?: string; acpSessionId?: string }): Promise<AcpSession> {
    const provider = this.provider(input.providerId);
    if (!provider) throw new AcpSessionError(400, "Configured ACP provider not found");
    const title = cleanTitle(input.title === undefined ? provider.label : input.title);
    if (!title) throw new AcpSessionError(400, "A session title is required");
    if (!input.rootPath) throw new AcpSessionError(409, "Open a workspace before creating an ACP session");
    const acpSessionId = cleanProviderSessionId(input.acpSessionId);
    if (input.acpSessionId !== undefined && !acpSessionId) throw new AcpSessionError(400, "A valid provider session id is required to resume");
    if (acpSessionId) {
      const existing = this.liveSessionFor(input.providerId, acpSessionId);
      if (existing) return cloneSession(existing.public);
    }

    const record = this.newRecord({
      id: randomUUID(),
      title,
      titleSource: input.title === undefined ? "provider" : "user",
      projectId: input.projectId,
      provider,
      rootPath: input.rootPath,
      acpSessionId,
    });
    try {
      await this.connectRecord(record);
      try {
        if (acpSessionId) await this.loadProviderSession(record, acpSessionId);
        else await this.createProviderSession(record);
      } catch (error) {
        if (!isAuthRequired(error)) throw error;
        record.public.status = "auth_required";
        record.public.error = errorMessage(error, record.provider);
      }
      this.sessions.set(record.public.id, record);
      this.publishStatus(record);
      this.persist(record.public.projectId);
      return cloneSession(record.public);
    } catch (error) {
      await this.disposeRecord(record, false);
      if (error instanceof AcpSessionError) throw error;
      throw new AcpSessionError(503, `Unable to start ACP provider: ${errorMessage(error, record.provider)}`);
    }
  }

  async authenticate(id: string, methodId: string): Promise<AcpSession> {
    const record = this.require(id);
    const method = record.public.authMethods.find((candidate) => candidate.id === methodId);
    if (!method) throw new AcpSessionError(400, "Authentication method is not advertised by the provider");
    if (method.type === "terminal") throw new AcpSessionError(400, "This provider requires its local terminal authentication flow");
    if (!record.adapter) throw new AcpSessionError(409, "ACP provider is not connected");
    try {
      await record.adapter.authenticate(methodId);
      await this.createProviderSession(record);
      record.public.status = "live";
      record.public.error = undefined;
      this.publishStatus(record);
      this.persist(record.public.projectId);
      return cloneSession(record.public);
    } catch (error) {
      record.public.status = "auth_required";
      record.public.error = errorMessage(error, record.provider);
      this.publishStatus(record);
      throw new AcpSessionError(401, `ACP authentication failed: ${errorMessage(error, record.provider)}`);
    }
  }

  async restore(projectId: string, rootPath: string, descriptors: AcpSessionDescriptor[]): Promise<AcpSession[]> {
    const restored: AcpSession[] = [];
    for (const descriptor of descriptors) {
      if (this.sessions.has(descriptor.id)) {
        restored.push(this.get(descriptor.id) as AcpSession);
        continue;
      }
      const provider = this.provider(descriptor.providerId);
      const record = this.newRecord({ id: descriptor.id, title: descriptor.title, titleSource: descriptor.titleSource, projectId, provider, providerId: descriptor.providerId, rootPath, acpSessionId: descriptor.acpSessionId });
      record.public.resumability = descriptor.resumability;
      this.sessions.set(record.public.id, record);
      if (descriptor.resumability === "non_resumable") {
        record.public.status = "non_resumable";
        record.public.error = "The recorded provider session cannot be resumed";
        this.publishStatus(record);
        restored.push(cloneSession(record.public));
        continue;
      }
      if (!provider) {
        record.public.status = descriptor.resumability === "resumable" ? "failed" : "non_resumable";
        record.public.error = "The configured ACP provider is unavailable";
        this.publishStatus(record);
        restored.push(cloneSession(record.public));
        continue;
      }
      try {
        await this.connectRecord(record);
        if (record.public.authMethods.length && !record.public.acpSessionId) {
          record.public.status = "auth_required";
        } else if (record.public.capabilities.canLoad) {
          const response = await record.adapter?.loadSession(descriptor.acpSessionId, rootPath);
          if (response) this.applySessionResponse(record, response);
          this.applyRestoredSession(record);
        } else if (record.public.capabilities.canResume) {
          const response = await record.adapter?.resumeSession(descriptor.acpSessionId, rootPath);
          if (response) this.applySessionResponse(record, response);
          this.applyRestoredSession(record);
        } else {
          record.public.status = "non_resumable";
          record.public.resumability = "non_resumable";
          record.public.error = "This provider cannot restore the recorded session";
          await this.disposeRecord(record, false);
        }
      } catch (error) {
        record.public.status = isAuthRequired(error) ? "auth_required" : "disconnected";
        record.public.error = errorMessage(error, record.provider);
        if (record.public.status !== "auth_required") await this.disposeRecord(record, false);
      }
      this.publishStatus(record);
      restored.push(cloneSession(record.public));
    }
    return restored;
  }

  async prompt(id: string, request: AcpPromptRequest): Promise<void> {
    const record = this.require(id);
    if (record.public.status === "auth_required") throw new AcpSessionError(401, "Authenticate the ACP provider before prompting");
    if (!record.adapter || !record.public.acpSessionId || record.public.status === "disconnected" || record.public.status === "exited") {
      throw new AcpSessionError(409, "ACP session is not live");
    }
    if (record.public.activePrompt) throw new AcpSessionError(409, "An ACP prompt is already active");
    if (!request.text.trim()) throw new AcpSessionError(400, "Prompt text is required");
    if (request.text.length > MAX_PROMPT_TEXT || (request.context?.length ?? 0) > MAX_PROMPT_CONTEXT_ITEMS || request.context?.some((context) => context.content.length > MAX_PROMPT_TEXT)) {
      throw new AcpSessionError(413, "ACP prompt content is too large");
    }

    record.public.activePrompt = true;
    record.public.status = "live";
    this.appendActivity(record, { type: "message", id: `user-${randomUUID()}`, role: "user", text: request.text, format: "markdown" });
    this.publishStatus(record);
    const prompt = [{ type: "text" as const, text: request.text }, ...(request.context ?? []).map(contextBlock)];
    try {
      const result = await record.adapter.prompt(record.public.acpSessionId, prompt);
      const status = result.stopReason === "cancelled" ? "cancelled" : "completed";
      this.appendActivity(record, { type: "turn", status });
    } catch (error) {
      const status = isCancelled(error) ? "cancelled" : "failed";
      this.appendActivity(record, { type: "turn", status, message: errorMessage(error, record.provider) });
      if (!isCancelled(error) && !record.exitHandled) {
        if (record.connectionClosed && record.transport?.child.stdout?.destroyed) await record.connectionClosed;
      }
      if (!isCancelled(error) && !record.exitHandled) {
        record.public.status = "failed";
        record.public.error = errorMessage(error, record.provider);
      }
    } finally {
      record.public.activePrompt = false;
      if (record.public.status !== "failed" && !record.exitHandled) record.public.status = "live";
      this.publishStatus(record);
    }
  }

  async cancel(id: string): Promise<void> {
    const record = this.require(id);
    if (!record.adapter || !record.public.acpSessionId) {
      this.cancelPending(record);
      return;
    }
    try {
      await record.adapter.cancel(record.public.acpSessionId);
    } finally {
      this.cancelPending(record);
      await this.closeOwnedResources(record);
    }
  }

  async setConfigOption(id: string, configId: string, value: string | boolean): Promise<AcpConfigOption[]> {
    const record = this.require(id);
    const option = record.public.configOptions.find((candidate) => candidate.id === configId);
    if (!option) throw new AcpSessionError(400, "Configuration option is not advertised by the provider");
    if (option.type === "boolean" && typeof value !== "boolean") throw new AcpSessionError(400, "Boolean configuration option requires a boolean value");
    if (option.type === "select" && (typeof value !== "string" || !option.choices?.some((choice) => choice.value === value))) {
      throw new AcpSessionError(400, "Configuration value is not advertised by the provider");
    }
    if (!record.adapter || !record.public.acpSessionId) throw new AcpSessionError(409, "ACP session is not live");
    const result = await record.adapter.setConfigOption(record.public.acpSessionId, configId, value);
    this.applyConfigOptions(record, result.configOptions);
    this.rememberPreference(record, option, value);
    return record.public.configOptions.map((candidate) => ({ ...candidate, ...(candidate.choices ? { choices: [...candidate.choices] } : {}) }));
  }

  respondToRequest(id: string, requestId: string, response: AcpRequestResponse): void {
    const record = this.require(id);
    const pending = record.pending.get(requestId);
    if (!pending) throw new AcpSessionError(404, "ACP request is no longer pending");
    if (pending.publicRequest.type === "permission") {
      if (!("outcome" in response)) throw new AcpSessionError(400, "Permission response is required");
      if (response.outcome === "selected" && !pending.publicRequest.request.options.some((option) => option.id === response.optionId)) {
        throw new AcpSessionError(400, "Permission option is not available");
      }
      pending.resolve(response.outcome === "selected"
        ? { outcome: { outcome: "selected", optionId: response.optionId } }
        : { outcome: { outcome: "cancelled" } });
    } else {
      if (!("action" in response)) throw new AcpSessionError(400, "Elicitation response is required");
      pending.resolve(response.action === "accept" ? { action: "accept", content: response.content } : { action: response.action });
    }
    record.pending.delete(requestId);
    record.public.pendingRequests = record.public.pendingRequests.filter((item) => requestIdFor(item) !== requestId);
    this.publish(record, { type: "request_resolved", sessionId: record.public.id, requestId });
    this.publishStatus(record);
  }

  rename(id: string, title: string): AcpSession {
    const record = this.require(id);
    const clean = cleanTitle(title);
    if (!clean) throw new AcpSessionError(400, "A session title is required");
    record.public.title = clean;
    record.public.titleSource = "user";
    this.publishStatus(record);
    this.persist(record.public.projectId);
    return cloneSession(record.public);
  }

  async closeSession(id: string): Promise<void> {
    const record = this.require(id);
    await this.disposeRecord(record, true);
    this.sessions.delete(id);
    this.publishRemoved(record);
    this.persist(record.public.projectId);
  }

  async closeByProject(projectId: string): Promise<void> {
    const records = [...this.sessions.values()].filter((record) => record.public.projectId === projectId);
    await Promise.all(records.map((record) => this.disposeRecord(record, false)));
    for (const record of records) this.sessions.delete(record.public.id);
    if (records.length) this.persist(projectId);
  }

  async close(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((record) => this.disposeRecord(record, false)));
    this.sessions.clear();
  }

  private newRecord(input: { id: string; title: string; titleSource?: AcpTitleSource; projectId: string; rootPath: string; provider?: AcpAgentConfig; providerId?: string; acpSessionId?: string }): LiveAcpSession {
    const providerId = input.provider?.id ?? input.providerId ?? "unknown";
    const providerLabel = input.provider?.label ?? input.providerId ?? "Unavailable provider";
    const publicSession: AcpSession = {
      id: input.id,
      title: input.title,
      titleSource: input.titleSource ?? "user",
      projectId: input.projectId,
      providerId,
      providerLabel,
      ...(input.acpSessionId ? { acpSessionId: input.acpSessionId } : {}),
      status: "connecting",
      capabilities: { ...DEFAULT_CAPABILITIES },
      configOptions: [],
      availableCommands: [],
      authMethods: [],
      pendingRequests: [],
      activePrompt: false,
      resumability: "unknown",
    };
    return {
      public: publicSession,
      rootPath: input.rootPath,
      provider: input.provider ?? { id: providerId, label: providerLabel, command: "", args: [] },
      log: new AcpEventLog(),
      history: [],
      pending: new Map(),
      closing: false,
      exitHandled: false,
    };
  }

  private async connectRecord(record: LiveAcpSession): Promise<void> {
    if (!record.provider.command) throw new AcpSessionError(503, "ACP provider is unavailable");
    record.public.status = "connecting";
    const transport = openAcpTransport({ command: record.provider.command, args: record.provider.args, cwd: record.rootPath, env: record.provider.env });
    record.transport = transport;
    const adapter = new AcpProtocolAdapter(transport, this.protocolCallbacks(record));
    record.adapter = adapter;
    void transport.closed.then((exit) => this.handleProcessExit(record, exit));
    adapter.connect();
    record.connectionClosed = adapter.closed.then(() => this.handleConnectionClosed(record));
    const initialized = await adapter.initialize();
    if (initialized.protocolVersion !== acp.PROTOCOL_VERSION) throw new Error(`Unsupported ACP protocol version ${initialized.protocolVersion}`);
    record.public.authMethods = normalizeAuthMethods(initialized.authMethods);
    record.public.capabilities = capabilitiesFor(initialized);
  }

  private async createProviderSession(record: LiveAcpSession): Promise<void> {
    if (!record.adapter) throw new Error("ACP provider is not connected");
    const response = await record.adapter.newSession(record.rootPath);
    record.public.acpSessionId = response.sessionId;
    this.applySessionResponse(record, response);
    await this.applyProviderPreferences(record);
    record.public.resumability = record.public.capabilities.canLoad || record.public.capabilities.canResume ? "resumable" : "non_resumable";
    record.public.status = "live";
    record.public.error = undefined;
  }

  private async loadProviderSession(record: LiveAcpSession, acpSessionId: string): Promise<void> {
    if (!record.adapter) throw new Error("ACP provider is not connected");
    if (!record.public.capabilities.canLoad && !record.public.capabilities.canResume) {
      throw new AcpSessionError(409, "This provider cannot load a provider session");
    }
    // Bind the id before loading so the replayed session updates are attributed to this record.
    record.public.acpSessionId = acpSessionId;
    const response = record.public.capabilities.canLoad
      ? await record.adapter.loadSession(acpSessionId, record.rootPath)
      : await record.adapter.resumeSession(acpSessionId, record.rootPath);
    if (response) this.applySessionResponse(record, response);
    await this.applyProviderPreferences(record);
    record.public.resumability = record.public.capabilities.canLoad || record.public.capabilities.canResume ? "resumable" : "non_resumable";
    record.public.status = "live";
    record.public.error = undefined;
  }

  async rollover(id: string): Promise<AcpSession> {
    const record = this.require(id);
    if (record.public.activePrompt) throw new AcpSessionError(409, "Cancel the active prompt first");
    if (record.public.status === "auth_required") throw new AcpSessionError(409, "Authenticate the provider before starting a new context");
    if (record.public.status !== "live" || !record.adapter || !record.public.acpSessionId) throw new AcpSessionError(409, "ACP session is not live");
    const closedId = record.public.acpSessionId;
    const canClose = record.public.capabilities.canClose;
    const snapshot = {
      history: record.history,
      configOptions: record.public.configOptions,
      availableCommands: record.public.availableCommands,
      acpSessionId: closedId,
      title: record.public.title,
      titleSource: record.public.titleSource,
    };
    // Revert a provider-derived title before the swap so a fresh provider title arriving mid-rollover wins.
    const titleReverted = record.public.titleSource !== "user";
    if (titleReverted) {
      record.public.title = record.provider.label;
      record.public.titleSource = "provider";
    }
    record.public.availableCommands = [];
    record.public.configOptions = [];
    record.history = [];
    try {
      await this.createProviderSession(record);
    } catch (error) {
      record.history = snapshot.history;
      record.public.configOptions = snapshot.configOptions;
      record.public.availableCommands = snapshot.availableCommands;
      record.public.acpSessionId = snapshot.acpSessionId;
      if (titleReverted) {
        record.public.title = snapshot.title;
        record.public.titleSource = snapshot.titleSource;
      }
      record.public.status = "live";
      this.publishStatus(record);
      if (error instanceof AcpSessionError) throw error;
      throw new AcpSessionError(503, `Unable to start a new ACP context: ${errorMessage(error, record.provider)}`);
    }
    if (canClose) {
      try { await record.adapter?.closeSession(closedId); } catch { /* The previous context stays resumable in the provider store. */ }
    }
    this.publishStatus(record);
    this.persist(record.public.projectId);
    return cloneSession(record.public);
  }

  private applyRestoredSession(record: LiveAcpSession): void {
    record.public.resumability = "restored";
    record.public.status = "live";
    record.public.error = undefined;
  }

  private applySessionResponse(record: LiveAcpSession, response: acp.NewSessionResponse | acp.LoadSessionResponse | acp.ResumeSessionResponse): void {
    this.applyConfigOptions(record, response.configOptions);
  }

  private applyConfigOptions(record: LiveAcpSession, options: readonly acp.SessionConfigOption[] | null | undefined): void {
    if (!options) return;
    record.public.configOptions = normalizeConfigOptions(options);
    record.public.capabilities = { ...record.public.capabilities, canSetConfig: record.public.configOptions.length > 0 };
    this.publish(record, { type: "config", sessionId: record.public.id, options: record.public.configOptions });
  }

  private async applyProviderPreferences(record: LiveAcpSession): Promise<void> {
    if (!record.adapter || !record.public.acpSessionId) return;
    const preferences = this.providerPreferenceValues.get(record.public.providerId);
    if (!preferences?.size) return;
    for (const [configId, value] of preferences) {
      const option = record.public.configOptions.find((candidate) => candidate.id === configId);
      if (!option || !compatiblePreference(option, value) || option.currentValue === value) continue;
      try {
        const result = await record.adapter.setConfigOption(record.public.acpSessionId, configId, value);
        this.applyConfigOptions(record, result.configOptions);
      } catch {
        // Remembered settings are best-effort; provider defaults remain usable.
      }
    }
  }

  private rememberPreference(record: LiveAcpSession, option: AcpConfigOption, requested: AcpProviderPreferenceValue): void {
    if (sensitivePreferenceOption(option)) return;
    const updated = record.public.configOptions.find((candidate) => candidate.id === option.id);
    const canonical = updated?.currentValue;
    const value = updated && isPreferenceValue(canonical) && compatiblePreference(updated, canonical) ? canonical : requested;
    let preferences = this.providerPreferenceValues.get(record.public.providerId);
    if (!preferences) {
      preferences = new Map();
      this.providerPreferenceValues.set(record.public.providerId, preferences);
    }
    if (preferences.get(option.id) === value) return;
    preferences.set(option.id, value);
    if (this.options.onPreferencesChange) void this.options.onPreferencesChange(this.providerPreferences());
  }

  private protocolCallbacks(record: LiveAcpSession): AcpProtocolCallbacks {
    const resources = this.options.resources ?? {};
    return {
      sessionUpdate: async (params) => this.handleSessionUpdate(record, params),
      requestPermission: (params, requestId) => this.requestPermission(record, params, requestId),
      readTextFile: (params) => this.resource(record, resources.readTextFile, params, "readTextFile"),
      writeTextFile: (params) => this.resource(record, resources.writeTextFile, params, "writeTextFile"),
      createTerminal: (params) => this.resource(record, resources.createTerminal, params, "createTerminal"),
      terminalOutput: (params) => this.resource(record, resources.terminalOutput, params, "terminalOutput"),
      releaseTerminal: (params) => this.resource(record, resources.releaseTerminal, params, "releaseTerminal"),
      waitForTerminalExit: (params) => this.resource(record, resources.waitForTerminalExit, params, "waitForTerminalExit"),
      killTerminal: (params) => this.resource(record, resources.killTerminal, params, "killTerminal"),
      createElicitation: (params, requestId) => this.createElicitation(record, params, requestId),
      completeElicitation: (params) => this.completeElicitation(record, params),
    };
  }

  private async resource<TParams, TResult>(
    record: LiveAcpSession,
    handler: ((session: AcpSession, params: TParams) => Promise<TResult>) | undefined,
    params: TParams & { sessionId?: string },
    name: string,
  ): Promise<TResult> {
    this.requireProviderSession(record, params.sessionId);
    if (!handler) throw new Error(`ACP ${name} is not available`);
    return handler(cloneSession(record.public), params);
  }

  private async handleSessionUpdate(record: LiveAcpSession, params: acp.SessionNotification): Promise<void> {
    this.requireProviderSession(record, params.sessionId);
    const normalized = normalizeSessionUpdate(params.update);
    if (normalized.title && record.public.titleSource === "provider" && record.public.title !== normalized.title) {
      record.public.title = cleanTitle(normalized.title);
      this.publishStatus(record);
      this.persist(record.public.projectId);
    }
    if (normalized.configOptions) this.applyConfigOptions(record, normalized.configOptions.map(toSdkConfigOption));
    if (normalized.availableCommands) {
      record.public.availableCommands = normalized.availableCommands;
      this.publishStatus(record);
    }
    for (const activity of normalized.activities) this.appendActivity(record, activity);
  }

  private appendActivity(record: LiveAcpSession, activity: AcpActivity): void {
    const publishedActivity = record.provider.id === "cursor" ? stabilizeCursorMessageChunk(record.history, activity) : activity;
    record.history = appendAcpActivity(record.history, publishedActivity, this.maxHistoryItems);
    this.publish(record, { type: "activity", sessionId: record.public.id, activity: publishedActivity });
  }

  private async requestPermission(record: LiveAcpSession, params: acp.RequestPermissionRequest, requestId: string): Promise<acp.RequestPermissionResponse> {
    this.requireProviderSession(record, params.sessionId);
    const publicRequest = normalizePermissionRequest(params, requestId);
    return this.waitForRequest(record, publicRequest, (resolve) => resolve({ outcome: { outcome: "cancelled" } }));
  }

  private async createElicitation(record: LiveAcpSession, params: acp.CreateElicitationRequest, requestId: string): Promise<acp.CreateElicitationResponse> {
    const sessionId = "sessionId" in params && typeof params.sessionId === "string" ? params.sessionId : undefined;
    if (sessionId) this.requireProviderSession(record, sessionId);
    const publicRequest = normalizeElicitationRequest(params, requestId);
    return this.waitForRequest(record, publicRequest, (resolve) => resolve({ action: "cancel" }));
  }

  private async completeElicitation(record: LiveAcpSession, params: acp.CompleteElicitationNotification): Promise<void> {
    // URL elicitation is not advertised yet; retain an unexpected completion safely.
    this.appendActivity(record, { type: "unknown", name: "elicitation/complete", data: { elicitationId: params.elicitationId } });
  }

  private waitForRequest<T extends PendingResponse>(record: LiveAcpSession, publicRequest: AcpPendingRequest, fallback: (resolve: (response: T) => void) => void): Promise<T> {
    const requestId = requestIdFor(publicRequest);
    record.public.pendingRequests = [...record.public.pendingRequests, publicRequest];
    record.public.status = "waiting";
    const response = new Promise<T>((resolve) => {
      record.pending.set(requestId, { publicRequest, resolve: resolve as (response: PendingResponse) => void });
      if (record.closing) fallback(resolve);
    });
    this.publish(record, { type: "request", sessionId: record.public.id, request: publicRequest });
    this.publishStatus(record);
    return response.finally(() => {
      record.pending.delete(requestId);
      record.public.pendingRequests = record.public.pendingRequests.filter((item) => requestIdFor(item) !== requestId);
    });
  }

  private cancelPending(record: LiveAcpSession): void {
    const pending = [...record.pending.values()];
    record.pending.clear();
    record.public.pendingRequests = [];
    for (const request of pending) {
      if (request.publicRequest.type === "permission") request.resolve({ outcome: { outcome: "cancelled" } });
      else request.resolve({ action: "cancel" });
    }
    if (pending.length) this.publishStatus(record);
  }

  private requireProviderSession(record: LiveAcpSession, providerSessionId: string | undefined): void {
    if (!providerSessionId || providerSessionId !== record.public.acpSessionId) throw new Error("ACP session ID does not match the local session");
  }

  private liveSessionFor(providerId: string, acpSessionId: string): LiveAcpSession | undefined {
    return [...this.sessions.values()].find((record) => record.public.providerId === providerId && record.public.acpSessionId === acpSessionId && LIVE_SESSION_STATUSES.has(record.public.status));
  }

  private require(id: string): LiveAcpSession {
    const record = this.sessions.get(id);
    if (!record) throw new AcpSessionError(404, "ACP session not found");
    return record;
  }

  private provider(id: string): AcpAgentConfig | undefined {
    return this.options.config.acpAgents?.find((provider) => provider.id === id);
  }

  private publish(record: LiveAcpSession, event: AcpSessionEvent): void {
    const entry = record.log.append(event);
    this.options.onEvent({ type: "session_event", projectId: record.public.projectId, sessionId: record.public.id, sequence: entry.sequence, event });
  }

  private publishStatus(record: LiveAcpSession): void {
    this.publish(record, { type: "status", session: cloneSession(record.public) });
  }

  private publishRemoved(record: LiveAcpSession): void {
    this.options.onEvent({ type: "session_removed", projectId: record.public.projectId, sessionId: record.public.id, sequence: record.log.currentSequence + 1 });
  }

  private persist(projectId: string): void {
    if (this.options.onPersistenceChange) void this.options.onPersistenceChange(projectId, this.descriptors(projectId));
  }

  private handleProcessExit(record: LiveAcpSession, exit: AcpProcessExit): void {
    if (record.closing || record.exitHandled) return;
    record.exitHandled = true;
    record.public.activePrompt = false;
    record.public.status = exit.error ? "disconnected" : "exited";
    record.public.error = exit.error ? errorMessage(exit.error, record.provider) : undefined;
    this.cancelPending(record);
    void this.closeOwnedResources(record);
    this.publishStatus(record);
  }

  private handleConnectionClosed(record: LiveAcpSession): Promise<void> {
    if (record.closing || record.exitHandled || record.public.status === "exited") return Promise.resolve();
    return (async () => {
      const exit = await Promise.race([
        record.transport?.closed,
        new Promise<undefined>((resolve) => setTimeout(resolve, 100)),
      ]);
      if (record.closing || record.exitHandled) return;
      if (exit) {
        this.handleProcessExit(record, exit);
        return;
      }
      record.exitHandled = true;
      record.public.activePrompt = false;
      record.public.status = "disconnected";
      record.public.error = redactDiagnostic(record.transport?.stderr() || "ACP connection closed", record.provider);
      this.cancelPending(record);
      void this.closeOwnedResources(record);
      this.publishStatus(record);
    })();
  }

  private async disposeRecord(record: LiveAcpSession, closeProviderSession: boolean): Promise<void> {
    if (record.closing) return;
    record.closing = true;
    this.cancelPending(record);
    if (record.public.activePrompt && record.adapter && record.public.acpSessionId) {
      try { await record.adapter.cancel(record.public.acpSessionId); } catch { /* The connection may already be closed. */ }
    }
    if (closeProviderSession && record.adapter && record.public.acpSessionId && record.public.capabilities.canClose) {
      try { await record.adapter.closeSession(record.public.acpSessionId); } catch { /* Provider cleanup is best effort. */ }
    }
    record.adapter?.close();
    record.transport?.close();
    await this.closeOwnedResources(record);
    record.public.activePrompt = false;
  }

  private async closeOwnedResources(record: LiveAcpSession): Promise<void> {
    try { await this.options.resources?.closeSession?.(cloneSession(record.public)); } catch { /* Child terminal cleanup is best effort during provider shutdown. */ }
  }
}

function cloneSession(session: AcpSession): AcpSession {
  return {
    ...session,
    capabilities: { ...session.capabilities },
    authMethods: session.authMethods.map((method) => ({ ...method })),
    configOptions: session.configOptions.map((option) => ({ ...option, ...(option.choices ? { choices: option.choices.map((choice) => ({ ...choice })) } : {}) })),
    availableCommands: session.availableCommands.map((command) => ({ ...command })),
    pendingRequests: session.pendingRequests.map((pending) => pending.type === "permission"
      ? { type: "permission", request: { ...pending.request, options: pending.request.options.map((option) => ({ ...option })) } }
      : { type: "elicitation", request: { ...pending.request, fields: pending.request.fields.map((field) => ({ ...field, ...(field.choices ? { choices: field.choices.map((choice) => ({ ...choice })) } : {}) })) } }),
  };
}

function descriptorFor(record: LiveAcpSession): AcpSessionDescriptor | undefined {
  if (!record.public.acpSessionId) return undefined;
  return {
    id: record.public.id,
    title: record.public.title,
    providerId: record.public.providerId,
    acpSessionId: record.public.acpSessionId,
    resumability: record.public.resumability === "resumable" || record.public.resumability === "restored" ? "resumable" : "non_resumable",
    titleSource: record.public.titleSource,
  };
}

function normalizeAuthMethods(methods: readonly acp.AuthMethod[] | undefined): AcpAuthMethod[] {
  return (methods ?? []).map((method) => ({ id: method.id, label: method.name, type: "type" in method && method.type === "terminal" ? "terminal" : "agent", ...(method.description ? { description: method.description } : {}) }));
}

function capabilitiesFor(response: acp.InitializeResponse): AcpSessionCapabilities {
  const capabilities = response.agentCapabilities;
  return {
    ...DEFAULT_CAPABILITIES,
    canLoad: Boolean(capabilities?.loadSession),
    canList: Boolean(capabilities?.sessionCapabilities?.list),
    canResume: Boolean(capabilities?.sessionCapabilities?.resume),
    canClose: Boolean(capabilities?.sessionCapabilities?.close),
  };
}

function toSdkConfigOption(option: AcpConfigOption): acp.SessionConfigOption {
  if (option.type === "boolean") return { type: "boolean", id: option.id, name: option.label, currentValue: Boolean(option.currentValue) };
  return {
    type: "select",
    id: option.id,
    name: option.label,
    currentValue: typeof option.currentValue === "string" ? option.currentValue : option.choices?.[0]?.value ?? "",
    options: (option.choices ?? []).map((choice) => ({ value: choice.value, name: choice.label })),
  };
}

function compatiblePreference(option: AcpConfigOption, value: AcpProviderPreferenceValue): boolean {
  if (option.type === "boolean") return typeof value === "boolean";
  return typeof value === "string" && option.choices?.some((choice) => choice.value === value) === true;
}

function isPreferenceValue(value: unknown): value is AcpProviderPreferenceValue {
  return typeof value === "boolean" || (typeof value === "string" && value.length <= 500);
}

function sensitivePreferenceOption(option: AcpConfigOption): boolean {
  return /(^|[-_. ])(token|secret|password|api[\s_-]?key|authorization|credential)(?:$|[-_. ])/i.test(`${option.id} ${option.label}`);
}

function contextBlock(context: NonNullable<AcpPromptRequest["context"]>[number]): acp.ContentBlock {
  const scope = context.startLine && context.endLine ? `lines ${context.startLine}-${context.endLine}` : "whole file";
  const language = context.language || "text";
  const runs = context.content.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(3, runs.reduce((length, run) => Math.max(length, run.length), 0) + 1));
  return { type: "text", text: `--- ${context.path} (${scope}) ---\n${fence}${language}\n${context.content}\n${fence}` };
}

function requestIdFor(request: AcpPendingRequest): string {
  return request.request.requestId;
}

function cleanTitle(value: string): string {
  const clean = value.trim();
  return clean.length <= 80 ? clean : clean.slice(0, 80);
}

function errorMessage(error: unknown, provider?: AcpAgentConfig): string {
  return redactDiagnostic(error instanceof Error ? error.message : "ACP request failed", provider);
}

function redactDiagnostic(value: string, provider?: AcpAgentConfig): string {
  let message = value.slice(0, 4_096);
  for (const secret of Object.values(provider?.env ?? {}).filter((value) => value.length >= 3)) {
    message = message.replaceAll(secret, "[redacted]");
  }
  return message.replace(/(token|secret|password|api[-_]?key|authorization|credential)(\s*[=:]\s*)[^\s,;]+/gi, "$1$2[redacted]");
}

function isAuthRequired(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === -32000);
}

function isCancelled(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === -32800)
    || errorMessage(error).toLowerCase().includes("cancel");
}

function cleanProviderSessionId(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean && clean.length <= MAX_PROVIDER_SESSION_ID ? clean : undefined;
}

function cleanSummaryText(value: string | null | undefined, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: untrusted provider titles are sanitized deliberately
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function cleanSummaryTimestamp(value: string | null | undefined): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) || Math.abs(time) > 8.64e15 ? undefined : new Date(time).toISOString();
}

function summaryTimestamp(summary: AcpProviderSessionSummary): number {
  return summary.updatedAt ? Date.parse(summary.updatedAt) : Number.NaN;
}

export function summarizeProviderSessions(sessions: readonly acp.SessionInfo[] | undefined, rootPath: string): AcpProviderSessionSummary[] {
  return (sessions ?? [])
    .flatMap((info) => {
      const sessionId = cleanProviderSessionId(info?.sessionId);
      if (!sessionId || info.cwd !== rootPath) return [];
      const title = cleanSummaryText(info.title, MAX_PROVIDER_SESSION_TITLE);
      const updatedAt = cleanSummaryTimestamp(info.updatedAt);
      return [{ sessionId, ...(title ? { title } : {}), ...(updatedAt ? { updatedAt } : {}) }];
    })
    .sort((left, right) => (summaryTimestamp(right) || -Infinity) - (summaryTimestamp(left) || -Infinity))
    .slice(0, MAX_PROVIDER_SESSIONS);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("ACP provider request timed out")), timeoutMs);
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function transientCallbacks(): AcpProtocolCallbacks {
  const unavailable = (operation: string) => new Error(`ACP ${operation} is not available while listing provider sessions`);
  return {
    sessionUpdate: async () => undefined,
    requestPermission: async () => ({ outcome: { outcome: "cancelled" } }),
    createElicitation: async () => ({ action: "cancel" }),
    readTextFile: async () => { throw unavailable("file access"); },
    writeTextFile: async () => { throw unavailable("file access"); },
    createTerminal: async () => { throw unavailable("terminal access"); },
    terminalOutput: async () => { throw unavailable("terminal access"); },
    releaseTerminal: async () => undefined,
    waitForTerminalExit: async () => { throw unavailable("terminal access"); },
    killTerminal: async () => undefined,
    completeElicitation: async () => undefined,
  };
}

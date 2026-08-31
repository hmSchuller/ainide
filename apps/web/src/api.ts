import type {
  AcpConfigOption,
  AcpPromptRequest,
  AcpProviderDescriptor,
  AcpRequestResponse,
  AcpServerEvent,
  AcpSession,
  AcpSessionDetail,
  FileEntry,
  GitStatus,
  ProjectRef,
  ProjectSessionSnapshot,
  RecentChange,
  ReviewScope,
  ReviewStatus,
  TerminalSession,
  Workspace,
  WorkspaceEvent,
} from "@ainide/shared";
import type { SessionResponse, TerminalResponse } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function headers(token?: string, json = false): HeadersInit {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    ...(token ? { "x-session-token": token } : {}),
  };
}

export async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...headers(token, typeof init.body === "string"), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? detail;
    } catch {
      // The status text is the best error available for non-JSON responses.
    }
    throw new ApiError(`${response.status}: ${detail}`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function unwrap<T>(value: T | { workspace: T } | { data: T }): T {
  if (typeof value === "object" && value !== null) {
    const candidate = value as { workspace?: T; data?: T };
    if (candidate.workspace !== undefined) return candidate.workspace;
    if (candidate.data !== undefined) return candidate.data;
  }
  return value as T;
}

export async function getSession(): Promise<SessionResponse> {
  return request<SessionResponse>("/api/session");
}

export async function getWorkspace(token: string): Promise<Workspace> {
  return unwrap(await request<Workspace | { workspace: Workspace }>("/api/workspace", token));
}

export async function openWorkspace(path: string, token: string): Promise<Workspace> {
  return unwrap(
    await request<Workspace | { workspace: Workspace }>("/api/workspace/open", token, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  );
}

export interface ProjectMutationResponse {
  workspace: Workspace | null;
  activeProjectId: string | null;
  openProjects: ProjectRef[];
  knownProjects: ProjectRef[];
  snapshot?: ProjectSessionSnapshot;
  acpSessions?: AcpSession[];
}

export async function openProject(path: string, token: string, snapshot?: ProjectSessionSnapshot): Promise<ProjectMutationResponse> {
  return request<ProjectMutationResponse>("/api/projects/open", token, {
    method: "POST",
    body: JSON.stringify({ path, ...(snapshot ? { snapshot } : {}) }),
  });
}

export async function switchProject(projectId: string, token: string, snapshot?: ProjectSessionSnapshot): Promise<ProjectMutationResponse> {
  return request<ProjectMutationResponse>("/api/projects/switch", token, {
    method: "POST",
    body: JSON.stringify({ projectId, ...(snapshot ? { snapshot } : {}) }),
  });
}

export async function closeProject(projectId: string, token: string, snapshot?: ProjectSessionSnapshot): Promise<ProjectMutationResponse> {
  return request<ProjectMutationResponse>("/api/projects", token, {
    method: "DELETE",
    body: JSON.stringify({ projectId, ...(snapshot ? { snapshot } : {}) }),
  });
}

export async function saveProjectSnapshot(token: string, snapshot: Partial<ProjectSessionSnapshot> & { projectId?: string }): Promise<void> {
  await request("/api/projects/snapshot", token, {
    method: "PUT",
    body: JSON.stringify(snapshot),
  });
}

export async function listFiles(path: string, token: string): Promise<FileEntry[]> {
  const query = new URLSearchParams({ path });
  const result = await request<FileEntry[] | { files: FileEntry[]; entries?: FileEntry[] }>(
    `/api/files?${query.toString()}`,
    token,
  );
  return Array.isArray(result) ? result : result.files ?? result.entries ?? [];
}

export async function getGitStatus(token: string): Promise<GitStatus> {
  const result = await request<GitStatus | { status: GitStatus }>("/api/git/status", token);
  return "status" in result ? result.status : result;
}

export async function readFile(path: string, token: string): Promise<{ content: string; binary: boolean }> {
  const query = new URLSearchParams({ path });
  const response = await fetch(`/api/file?${query.toString()}`, { headers: headers(token) });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? detail;
    } catch {
      // The status text is the best error available for non-JSON responses.
    }
    throw new ApiError(`${response.status}: ${detail}`, response.status);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const result = (await response.json()) as { content?: string; data?: string; binary?: boolean; isBinary?: boolean; type?: string };
    return { content: result.content ?? result.data ?? "", binary: Boolean(result.binary ?? result.isBinary ?? result.type === "binary") };
  }
  if (contentType.startsWith("application/octet-stream") || contentType.startsWith("image/")) {
    return { content: "", binary: true };
  }
  return { content: await response.text(), binary: false };
}

export async function writeFile(path: string, content: string, token: string): Promise<void> {
  const query = new URLSearchParams({ path });
  await request<void>(`/api/file?${query.toString()}`, token, {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  });
}

export async function deleteFile(path: string, token: string): Promise<void> {
  const query = new URLSearchParams({ path });
  await request<void>(`/api/file?${query.toString()}`, token, { method: "DELETE" });
}

export async function renameFile(from: string, to: string, token: string): Promise<void> {
  await request<void>("/api/file/rename", token, {
    method: "POST",
    body: JSON.stringify({ from, to }),
  });
}

export async function createPath(path: string, type: "file" | "directory", token: string): Promise<void> {
  await request<void>("/api/file/create", token, {
    method: "POST",
    body: JSON.stringify({ path, type }),
  });
}

export async function getTerminals(token: string): Promise<TerminalSession[]> {
  const result = await request<TerminalResponse | TerminalSession[]>("/api/terminals", token);
  return Array.isArray(result) ? result : result.sessions ?? [];
}

export async function getAcpProviders(token: string): Promise<AcpProviderDescriptor[]> {
  return request<AcpProviderDescriptor[]>("/api/acp/providers", token);
}

export async function getAcpSessions(token: string): Promise<AcpSession[]> {
  return request<AcpSession[]>("/api/acp/sessions", token);
}

export async function getAcpSession(id: string, token: string): Promise<AcpSessionDetail> {
  return request<AcpSessionDetail>(`/api/acp/sessions/${encodeURIComponent(id)}`, token);
}

export async function createAcpSession(providerId: string, title: string, token: string): Promise<AcpSession> {
  return request<AcpSession>("/api/acp/sessions", token, { method: "POST", body: JSON.stringify({ providerId, title }) });
}

export async function promptAcpSession(id: string, prompt: AcpPromptRequest, token: string): Promise<void> {
  await request(`/api/acp/sessions/${encodeURIComponent(id)}/prompt`, token, { method: "POST", body: JSON.stringify(prompt) });
}

export async function cancelAcpSession(id: string, token: string): Promise<void> {
  await request(`/api/acp/sessions/${encodeURIComponent(id)}/cancel`, token, { method: "POST", body: JSON.stringify({}) });
}

export async function setAcpConfigOption(id: string, configId: string, value: string | boolean, token: string): Promise<AcpConfigOption[]> {
  const result = await request<{ options: AcpConfigOption[] }>(`/api/acp/sessions/${encodeURIComponent(id)}/config`, token, { method: "POST", body: JSON.stringify({ configId, value }) });
  return result.options;
}

export async function authenticateAcpSession(id: string, methodId: string, token: string): Promise<AcpSession> {
  return request<AcpSession>(`/api/acp/sessions/${encodeURIComponent(id)}/auth`, token, { method: "POST", body: JSON.stringify({ methodId }) });
}

export async function respondToAcpRequest(id: string, requestId: string, response: AcpRequestResponse, token: string): Promise<void> {
  await request(`/api/acp/sessions/${encodeURIComponent(id)}/requests/${encodeURIComponent(requestId)}`, token, { method: "POST", body: JSON.stringify(response) });
}

export async function renameAcpSession(id: string, title: string, token: string): Promise<AcpSession> {
  return request<AcpSession>(`/api/acp/sessions/${encodeURIComponent(id)}`, token, { method: "PATCH", body: JSON.stringify({ title }) });
}

export async function closeAcpSession(id: string, token: string): Promise<void> {
  await request(`/api/acp/sessions/${encodeURIComponent(id)}`, token, { method: "DELETE" });
}

export async function createTerminal(kind: TerminalSession["kind"], token: string, title?: string): Promise<TerminalSession> {
  const result = await request<TerminalResponse | TerminalSession>("/api/terminals", token, {
    method: "POST",
    body: JSON.stringify({ kind, ...(title ? { title } : {}) }),
  });
  const terminal = "id" in result ? result : result.terminal ?? result.session;
  if (!terminal) throw new Error("The terminal service returned no session");
  return terminal;
}

export async function closeTerminal(id: string, token: string): Promise<void> {
  await request<void>(`/api/terminals/${encodeURIComponent(id)}`, token, { method: "DELETE" });
}

export async function renameTerminal(id: string, title: string, token: string): Promise<TerminalSession> {
  return request<TerminalSession>(`/api/terminals/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function getReviewStatus(token: string): Promise<ReviewStatus> {
  return request<ReviewStatus>("/api/review/status", token);
}

export async function startReview(token: string, scope: ReviewScope = "working-tree", restart = false): Promise<ReviewStatus> {
  return request<ReviewStatus>("/api/review/start", token, { method: "POST", body: JSON.stringify({ scope, restart }) });
}

export async function searchFiles(query: string, token: string): Promise<FileEntry[]> {
  const params = new URLSearchParams({ q: query });
  const result = await request<FileEntry[] | { files: FileEntry[] }>(`/api/files/search?${params}`, token);
  return Array.isArray(result) ? result : result.files;
}

export function websocketUrl(endpoint: string, token: string, params: Record<string, string> = {}): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(endpoint, `${protocol}//${window.location.host}`);
  url.searchParams.set("token", token);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

export function parseEvent(data: string): WorkspaceEvent | RecentChange | null {
  try {
    return JSON.parse(data) as WorkspaceEvent | RecentChange;
  } catch {
    return null;
  }
}

export function parseAcpEvent(data: string): AcpServerEvent | null {
  try {
    const event = JSON.parse(data) as AcpServerEvent;
    return event && typeof event === "object" && "type" in event ? event : null;
  } catch {
    return null;
  }
}

export function acpEventsUrl(token: string): string {
  return websocketUrl("/acp-events", token);
}

export async function insertTerminalInput(token: string, sessionId: string, data: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(websocketUrl("/terminal", token, { sessionId }));
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.close();
      if (error) reject(error);
      else resolve();
    };
    const timer = window.setTimeout(() => finish(new Error("Terminal handoff timed out")), 5000);
    socket.onopen = () => socket.send(JSON.stringify({ type: "attach", sessionId }));
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; message?: string };
        if (message.type === "attached") {
          socket.send(JSON.stringify({ type: "input", sessionId, data }));
          window.clearTimeout(timer);
          finish();
        } else if (message.type === "error") {
          window.clearTimeout(timer);
          finish(new Error(message.message ?? "Terminal handoff failed"));
        }
      } catch {
        window.clearTimeout(timer);
        finish(new Error("Terminal handoff failed"));
      }
    };
    socket.onerror = () => {
      window.clearTimeout(timer);
      finish(new Error("Terminal handoff connection failed"));
    };
    socket.onclose = () => {
      if (!settled) {
        window.clearTimeout(timer);
        finish(new Error("Terminal handoff connection closed"));
      }
    };
  });
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { acpEventsUrl, createAcpSession, getAcpProviders, getGitFileComparison, getGitStatus, getProjectAgentSettings, getWorkspaceDirectoryChildren, parseAcpEvent, promptAcpSession, updateProjectAgentSettings } from "./api";

describe("ACP web API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends session tokens and JSON bodies for ACP requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/providers")) return new Response(JSON.stringify([{ id: "fake", label: "Fake" }]), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ id: "session-1", status: "live" }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAcpProviders("token-1")).resolves.toEqual([{ id: "fake", label: "Fake" }]);
    await createAcpSession("fake", "token-1");
    await promptAcpSession("session-1", { text: "Hello", context: [{ path: "src/a.ts", content: "code", startLine: 2, endLine: 2 }] }, "token-1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(createInit.body))).toEqual({ providerId: "fake" });
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toContain("/api/acp/sessions/session-1/prompt");
    expect((init.headers as Record<string, string>)["x-session-token"]).toBe("token-1");
    expect(JSON.parse(String(init.body))).toEqual({ text: "Hello", context: [{ path: "src/a.ts", content: "code", startLine: 2, endLine: 2 }] });
  });

  it("reads and updates a project's agent settings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/project/agents") && init?.method !== "PATCH") {
        return new Response(JSON.stringify({ all: [{ id: "cursor", label: "Cursor" }], disabled: ["cursor"] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, rootPath: "/proj", disabled: ["cursor"] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const settings = await getProjectAgentSettings("token-1");
    expect(settings).toEqual({ all: [{ id: "cursor", label: "Cursor" }], disabled: ["cursor"] });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/project/agents");

    const updated = await updateProjectAgentSettings("token-1", "/proj", ["cursor"]);
    expect(updated).toEqual({ ok: true, rootPath: "/proj", disabled: ["cursor"] });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/project/agents");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["x-session-token"]).toBe("token-1");
    expect(JSON.parse(String(init.body))).toEqual({ rootPath: "/proj", disabledAgents: ["cursor"] });
  });

  it("rejects malformed event payloads without throwing", () => {
    expect(parseAcpEvent("not json")).toBeNull();
    expect(parseAcpEvent(JSON.stringify({ type: "snapshot", projectId: "project", sessions: [], history: {}, sequence: 0 }))).toMatchObject({ type: "snapshot" });
  });

  it("puts the session token on the ACP socket URL", () => {
    vi.stubGlobal("window", { location: { protocol: "https:", host: "ainide.test" } });
    expect(acpEventsUrl("token-2")).toBe("wss://ainide.test/acp-events?token=token-2");
  });

  it("uses the authenticated Git status route", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-session-token"]).toBe("token-git");
      return new Response(JSON.stringify({ isRepository: true, dirty: false, files: [], summary: { filesChanged: 0, insertions: 0, deletions: 0 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGitStatus("token-git")).resolves.toMatchObject({ isRepository: true, dirty: false });
    expect(fetchMock).toHaveBeenCalledWith("/api/git/status", expect.objectContaining({ headers: expect.objectContaining({ "x-session-token": "token-git" }) }));
  });

  it("requests a workspace-relative Git baseline through the authenticated route", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-session-token"]).toBe("token-git");
      return new Response(JSON.stringify({ path: "src/a.ts", status: "modified", baseline: "head", head: "abc", isRepository: true, content: "before\n" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGitFileComparison("src/a.ts", "token-git")).resolves.toMatchObject({ path: "src/a.ts", baseline: "head", content: "before\n" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/git/compare?path=src%2Fa.ts");
  });

  it("retains the last successful value when a later status request fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ isRepository: true, dirty: true, files: [{ path: "a.ts", status: "modified" }], summary: { filesChanged: 1, insertions: 1, deletions: 0 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503, statusText: "Unavailable" }));
    vi.stubGlobal("fetch", fetchMock);

    const previous = await getGitStatus("token-git");
    await expect(getGitStatus("token-git")).rejects.toThrow("503");
    expect(previous.files).toEqual([{ path: "a.ts", status: "modified" }]);
  });

  it("requests one directory level with an optional final-segment query", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-session-token"]).toBe("token-path");
      return new Response(JSON.stringify({ currentPath: "/home/me", parentPath: "/home", homePath: "/home/me", children: [{ name: "projects", path: "/home/me/projects" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWorkspaceDirectoryChildren("~", "token-path", "pro j")).resolves.toMatchObject({ children: [{ name: "projects" }] });
    expect(new URL(`http://ainide.test${String(fetchMock.mock.calls[0]?.[0])}`).searchParams.get("path")).toBe("~");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("query=pro+j");
  });

  it("rejects malformed directory responses with a useful error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ currentPath: "/tmp", children: [] }), { status: 200 })));

    await expect(getWorkspaceDirectoryChildren("/tmp", "token-path")).rejects.toThrow("parentPath");
  });

  it("reports invalid JSON as a malformed directory response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));

    await expect(getWorkspaceDirectoryChildren("/tmp", "token-path")).rejects.toThrow("Malformed directory response");
  });
});

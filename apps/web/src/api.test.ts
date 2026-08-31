import { beforeEach, describe, expect, it, vi } from "vitest";
import { acpEventsUrl, createAcpSession, getAcpProviders, parseAcpEvent, promptAcpSession } from "./api";

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
    await createAcpSession("fake", "Work", "token-1");
    await promptAcpSession("session-1", { text: "Hello", context: [{ path: "src/a.ts", content: "code", startLine: 2, endLine: 2 }] }, "token-1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toContain("/api/acp/sessions/session-1/prompt");
    expect((init.headers as Record<string, string>)["x-session-token"]).toBe("token-1");
    expect(JSON.parse(String(init.body))).toEqual({ text: "Hello", context: [{ path: "src/a.ts", content: "code", startLine: 2, endLine: 2 }] });
  });

  it("rejects malformed event payloads without throwing", () => {
    expect(parseAcpEvent("not json")).toBeNull();
    expect(parseAcpEvent(JSON.stringify({ type: "snapshot", projectId: "project", sessions: [], history: {}, sequence: 0 }))).toMatchObject({ type: "snapshot" });
  });

  it("puts the session token on the ACP socket URL", () => {
    vi.stubGlobal("window", { location: { protocol: "https:", host: "ainide.test" } });
    expect(acpEventsUrl("token-2")).toBe("wss://ainide.test/acp-events?token=token-2");
  });
});

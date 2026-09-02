import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProjectAgentSettings, updateProjectAgentSettings } from "./api";
import { AcpProviderPicker } from "./components/AcpProviderPicker";

describe("project agent settings integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("toggling an agent updates the banlist and the picker no longer offers it", async () => {
    let disabled: string[] = [];
    const all = [
      { id: "cursor", label: "Cursor" },
      { id: "opencode", label: "OpenCode" },
      { id: "gemini", label: "Gemini" },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/project/agents") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { disabledAgents: string[] };
        disabled = body.disabledAgents;
        return new Response(JSON.stringify({ ok: true, rootPath: "/proj", disabled }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ all, disabled }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const initial = await getProjectAgentSettings("token-1");
    expect(initial.disabled).toEqual([]);

    const current = new Set(initial.disabled);
    current.add("gemini");
    const updated = await updateProjectAgentSettings("token-1", "/proj", [...current]);
    expect(updated.disabled).toEqual(["gemini"]);
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ rootPath: "/proj", disabledAgents: ["gemini"] });

    const refreshed = await getProjectAgentSettings("token-1");
    expect(refreshed.disabled).toEqual(["gemini"]);

    const markup = renderToStaticMarkup(
      <AcpProviderPicker providers={refreshed.all} disabled={refreshed.disabled} loading={false} onRetry={() => undefined} onSelect={() => undefined} onClose={() => undefined} />,
    );
    expect(markup).toContain("Cursor");
    expect(markup).toContain("OpenCode");
    expect(markup).not.toContain("Gemini");
  });
});

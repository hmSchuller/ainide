import type { AcpProviderDescriptor } from "@ainide/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AcpProviderPicker } from "./AcpProviderPicker";

const providers: AcpProviderDescriptor[] = [
  { id: "cursor", label: "Cursor" },
  { id: "opencode", label: "OpenCode" },
];

const props = {
  providers,
  loading: false,
  onRetry: () => undefined,
  onSelect: () => undefined,
  onRecentSelect: () => undefined,
  onClose: () => undefined,
};

describe("AcpProviderPicker", () => {
  it("renders configured labels and a direct PTY session choice", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} />);
    expect(markup).toContain("Cursor");
    expect(markup).toContain("OpenCode");
    expect(markup).not.toContain("cursor");
    expect(markup).not.toContain("opencode");
    expect(markup).toContain("PTY agent session");
    expect(markup).toContain('role="dialog"');
  });

  it("renders a retryable provider loading error", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} providers={[]} error="Provider service unavailable" />);
    expect(markup).toContain("Provider service unavailable");
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("No ACP providers configured");
  });

  it("hides a project-disabled provider but still offers the enabled ones", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} disabled={["opencode"]} />);
    expect(markup).toContain("Cursor");
    expect(markup).not.toContain("OpenCode");
  });

  it("shows the all-disabled empty state when every provider is disabled", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} disabled={["cursor", "opencode"]} />);
    expect(markup).toContain("No ACP providers available for this project");
    expect(markup).not.toContain("No ACP providers configured");
  });

  it("collapses recent sessions by default with a counted toggle and no rows", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} recentSessions={{ opencode: { status: "available", sessions: [{ sessionId: "s-1", title: "Refactor the parser", updatedAt: new Date(Date.now() - 5 * 60_000).toISOString() }, { sessionId: "s-2" }] } }} />);
    expect(markup).toContain("Start a new session");
    expect(markup).toContain("Recent sessions (2)");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain("Refactor the parser");
    expect(markup).not.toContain("Untitled provider session");
  });

  it("expands a provider's recents with titles and recency while keeping resume entries", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} initialExpandedProviders={["opencode"]} recentSessions={{ opencode: { status: "available", sessions: [{ sessionId: "s-1", title: "Refactor the parser", updatedAt: new Date(Date.now() - 5 * 60_000).toISOString() }, { sessionId: "s-2" }] } }} />);
    expect(markup).toContain("Start a new session");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Refactor the parser");
    expect(markup).toContain("5m ago");
    expect(markup).toContain("Untitled provider session");
  });

  it("expands providers independently", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} initialExpandedProviders={["opencode"]} recentSessions={{ opencode: { status: "available", sessions: [{ sessionId: "s-1", title: "Refactor the parser" }] }, cursor: { status: "available", sessions: [{ sessionId: "c-1", title: "Cursor work" }] } }} />);
    expect(markup).toContain("Refactor the parser");
    expect(markup).not.toContain("Cursor work");
    expect(markup).toContain("Recent sessions (1)");
  });

  it("starts collapsed on every fresh open", () => {
    const expanded = renderToStaticMarkup(<AcpProviderPicker {...props} initialExpandedProviders={["opencode"]} recentSessions={{ opencode: { status: "available", sessions: [{ sessionId: "s-1", title: "Refactor the parser" }] } }} />);
    expect(expanded).toContain("Refactor the parser");
    const reopened = renderToStaticMarkup(<AcpProviderPicker {...props} recentSessions={{ opencode: { status: "available", sessions: [{ sessionId: "s-1", title: "Refactor the parser" }] } }} />);
    expect(reopened).toContain('aria-expanded="false"');
    expect(reopened).not.toContain("Refactor the parser");
  });

  it("renders a muted empty state for providers without resumable sessions", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} recentSessions={{ opencode: { status: "empty", sessions: [] }, cursor: { status: "loading", sessions: [] } }} />);
    expect(markup).toContain("No resumable sessions in this workspace");
    expect(markup).toContain("Checking recent sessions...");
  });

  it("renders the unavailable state without dropping the start-new entry", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} recentSessions={{ opencode: { status: "unavailable", sessions: [] } }} />);
    expect(markup).toContain("Resuming is unavailable for OpenCode");
    expect(markup).toContain("Start a new session");
    expect(markup).not.toContain("Resuming is unavailable for Cursor");
  });
});

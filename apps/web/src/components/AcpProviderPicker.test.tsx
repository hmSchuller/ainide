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
  onClose: () => undefined,
};

describe("AcpProviderPicker", () => {
  it("renders configured labels without free-form or PTY choices", () => {
    const markup = renderToStaticMarkup(<AcpProviderPicker {...props} />);
    expect(markup).toContain("Cursor");
    expect(markup).toContain("OpenCode");
    expect(markup).not.toContain("cursor");
    expect(markup).not.toContain("opencode");
    expect(markup).not.toContain("PTY");
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
});

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AcpProviderDescriptor } from "@ainide/shared";
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
});

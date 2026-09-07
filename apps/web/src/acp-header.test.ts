import { describe, expect, it } from "vitest";
import { acpCapabilityLabels, acpConfigurationScope } from "./acp-header";

describe("ACP execution header identity", () => {
  it("only displays enabled negotiated capabilities", () => {
    expect(acpCapabilityLabels({ canCancel: true, canClose: false, canLoad: false, canList: false, canResume: true, canSetConfig: false, canReadTextFile: true, canWriteTextFile: false, canUseTerminal: true, canRequestPermission: true, canElicit: false })).toEqual(["Cancel", "Resume", "Read Text File", "Use Terminal", "Request Permission"]);
  });

  it("labels provider configuration as execution-scoped", () => {
    expect(acpConfigurationScope("local-session")).toContain("local-session");
    expect(acpConfigurationScope("local-session")).toContain("this ACP execution");
  });
});

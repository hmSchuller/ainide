import type { AcpSessionCapabilities } from "@ainide/shared";

/** Capability identity is derived only from negotiated provider facts. */
export function acpCapabilityLabels(capabilities: AcpSessionCapabilities): string[] {
  return Object.entries(capabilities)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name.replace(/^can/, "").replace(/([A-Z])/g, " $1").trim());
}

export function acpConfigurationScope(sessionId: string): string {
  return `Configuration for this ACP execution (${sessionId})`;
}

import type { AcpProviderSessionSummary } from "@ainide/shared";

export function describeRecentSessionRecency(updatedAt: string | undefined, now = Date.now()): string {
  if (!updatedAt) return "";
  const time = Date.parse(updatedAt);
  if (Number.isNaN(time) || time > now + 60_000) return "";
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(time).toLocaleDateString();
}

export function recentSessionLabel(summary: AcpProviderSessionSummary): string {
  return summary.title || "Untitled provider session";
}

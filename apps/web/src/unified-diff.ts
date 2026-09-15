export type UnifiedDiffLineKind = "header" | "hunk" | "addition" | "deletion" | "context" | "meta";

export interface UnifiedDiffLine {
  kind: UnifiedDiffLineKind;
  text: string;
}

export function parseUnifiedDiff(diff: string): UnifiedDiffLine[] {
  if (!diff.trim()) return [];
  return diff.split(/\r\n|\n|\r/).map((line) => {
    if (line.startsWith("@@")) return { kind: "hunk", text: line };
    if (line.startsWith("+++") || line.startsWith("---")) return { kind: "header", text: line };
    if (line.startsWith("+")) return { kind: "addition", text: line };
    if (line.startsWith("-")) return { kind: "deletion", text: line };
    if (line.startsWith("\\")) return { kind: "meta", text: line };
    return { kind: "context", text: line };
  });
}

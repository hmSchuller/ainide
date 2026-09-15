import { parseUnifiedDiff } from "../unified-diff";

interface UnifiedDiffViewProps {
  diff: string;
}

export function UnifiedDiffView({ diff }: UnifiedDiffViewProps) {
  const lines = parseUnifiedDiff(diff);
  if (!lines.length) return <pre className="acp-unified-diff-empty">No diff content</pre>;
  return <pre className="acp-unified-diff cockpit-scroll-nested" aria-label="Code diff">{lines.map((line, index) => <span className={`acp-unified-diff-line ${line.kind}`} key={`${line.kind}:${index}`}>{line.text || " "}</span>)}</pre>;
}

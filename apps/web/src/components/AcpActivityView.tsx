import { useState } from "react";
import type { AcpActivity } from "@ainide/shared";
import { MarkdownMessage } from "./MarkdownMessage";
import { UnifiedDiffView } from "./UnifiedDiffView";

export interface AcpInspectionTarget {
  turnId: string;
  activityId: string;
}

export interface AcpActivityViewProps {
  activity: AcpActivity;
  onOpenReference: (path: string, line: number, column?: number, target?: AcpInspectionTarget) => void;
  /** Open the existing project Review surface for a provider-reported diff. */
  onOpenDiff?: (path?: string, target?: AcpInspectionTarget) => void;
  inspectionTarget?: AcpInspectionTarget;
}

export function AcpActivityView({ activity, onOpenReference, onOpenDiff, inspectionTarget }: AcpActivityViewProps) {
  if (activity.type === "message") {
    if (activity.thought) return <ThoughtMessage source={activity.text} />;
    return <div className={`acp-stream-message ${activity.role}`}><MarkdownMessage source={activity.text} /></div>;
  }
  if (activity.type === "tool_call") return <details className={`acp-stream-tool ${activity.status}`}><summary><span className="acp-stream-tool-title">{activity.title}</span><span className="acp-stream-tool-status">{activity.status}</span></summary><div className="acp-stream-tool-body cockpit-scroll-nested">{activity.input && <pre>{activity.input}</pre>}{activity.output && <pre>{activity.output}</pre>}</div></details>;
  if (activity.type === "plan") return <div className={`acp-stream-plan ${activity.status ?? ""}`}><span className="acp-stream-plan-title">Plan{activity.status ? ` · ${activity.status}` : ""}</span><span className="acp-stream-plan-text">{activity.text}</span></div>;
  if (activity.type === "location") return <button type="button" className="acp-stream-location" data-activity-id={inspectionTarget?.activityId} onClick={() => onOpenReference(activity.path, activity.line ?? 1, activity.column, inspectionTarget)}>Open {activity.path}{activity.line ? `:${activity.line}` : ""}</button>;
  if (activity.type === "diff") return <div className="acp-stream-diff"><div className="acp-stream-diff-header"><span className="acp-stream-diff-title">{activity.path ? activity.path : "Diff"}</span>{onOpenDiff && <button type="button" className="acp-stream-diff-review" data-activity-id={inspectionTarget?.activityId} onClick={() => onOpenDiff(activity.path, inspectionTarget)}>Open in Review</button>}</div><UnifiedDiffView diff={activity.diff} /></div>;
  if (activity.type === "terminal") return <details className="acp-stream-terminal"><summary><span className="acp-stream-terminal-title">Terminal {activity.status ?? "output"}</span></summary><div className="acp-stream-terminal-body cockpit-scroll-nested"><pre>{activity.output ?? "No output retained"}</pre></div></details>;
  if (activity.type === "usage") return <div className="acp-stream-usage">Usage: {activity.totalTokens ?? "?"} tokens</div>;
  if (activity.type === "turn") return null;
  return <details className="acp-stream-unknown"><summary>Unknown provider activity · {activity.name}</summary><div className="acp-stream-unknown-body cockpit-scroll-nested"><pre>{JSON.stringify(activity.data, null, 2)}</pre></div></details>;
}

function ThoughtMessage({ source }: { source: string }) {
  const [expanded, setExpanded] = useState(false);
  return <details className="acp-stream-thought" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>Thinking…</summary>
    {expanded ? <div className="acp-stream-thought-body"><MarkdownMessage source={source} /></div> : null}
  </details>;
}

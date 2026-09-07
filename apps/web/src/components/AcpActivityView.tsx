import type { AcpActivity } from "@ainide/shared";
import { MarkdownMessage } from "./MarkdownMessage";

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
    if (activity.thought) return <details className="acp-thought"><summary><span className="acp-activity-label">thinking</span></summary><MarkdownMessage source={activity.text} /></details>;
    return <div className={`acp-message ${activity.role}`}><span className="acp-activity-label">{activity.role}</span><MarkdownMessage source={activity.text} /></div>;
  }
  if (activity.type === "tool_call") return <details className={`acp-tool ${activity.status}`} open={activity.status === "running"}><summary><span>{activity.title}</span><small>{activity.status}</small></summary>{activity.input && <pre>{activity.input}</pre>}{activity.output && <pre>{activity.output}</pre>}</details>;
  if (activity.type === "plan") return <div className="acp-plan"><span className="acp-activity-label">plan{activity.status ? ` · ${activity.status}` : ""}</span><p>{activity.text}</p></div>;
  if (activity.type === "location") return <button type="button" className="acp-location" data-activity-id={inspectionTarget?.activityId} onClick={() => onOpenReference(activity.path, activity.line ?? 1, activity.column, inspectionTarget)}>Open {activity.path}{activity.line ? `:${activity.line}` : ""}</button>;
  if (activity.type === "diff") return <details className="acp-diff"><summary>Diff{activity.path ? ` · ${activity.path}` : ""}</summary><pre>{activity.diff}</pre>{onOpenDiff && <button type="button" className="acp-diff-review" data-activity-id={inspectionTarget?.activityId} onClick={() => onOpenDiff(activity.path, inspectionTarget)}>Open in Review</button>}</details>;
  if (activity.type === "terminal") return <details className="acp-terminal-activity"><summary>Terminal {activity.status ?? "output"}</summary><pre>{activity.output ?? "No output retained"}</pre></details>;
  if (activity.type === "usage") return <small className="acp-usage">Usage: {activity.totalTokens ?? "?"} tokens</small>;
  if (activity.type === "turn") return <div className={`acp-turn ${activity.status}`}>{activity.status}{activity.message ? ` · ${activity.message}` : ""}</div>;
  return <details className="acp-unknown"><summary>Unknown provider activity · {activity.name}</summary><pre>{JSON.stringify(activity.data, null, 2)}</pre></details>;
}

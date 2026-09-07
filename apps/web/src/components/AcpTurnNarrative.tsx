import type { AcpActivity, AcpPendingRequest } from "@ainide/shared";
import { projectAcpTurns } from "../acp-turns";
import { AcpActivityView, type AcpInspectionTarget } from "./AcpActivityView";
import { MarkdownMessage } from "./MarkdownMessage";

interface AcpTurnNarrativeProps {
  history: readonly AcpActivity[];
  pendingRequests: readonly AcpPendingRequest[];
  onOpenReference: (path: string, line: number, column?: number, target?: AcpInspectionTarget) => void;
  onOpenDiff?: (path?: string, target?: AcpInspectionTarget) => void;
}

export function AcpTurnNarrative({ history, pendingRequests, onOpenReference, onOpenDiff }: AcpTurnNarrativeProps) {
  const projection = projectAcpTurns(history, pendingRequests);
  if (!projection.turns.length) return <p className="acp-history-empty">Prompt this session to start a provider conversation.</p>;
  return <div className="acp-turn-narrative">
    {projection.omittedTurns > 0 && <p className="acp-history-bound">Showing the latest {projection.turns.length} turns; {projection.omittedTurns} older turns remain outside the live view.</p>}
    {projection.turns.map((turn) => <article className={`acp-turn-card ${turn.classification} ${turn.status}`} data-turn-id={turn.id} key={turn.id}>
      <header className="acp-turn-card-header"><span>{turn.classification === "legacy" ? "Historical activity · unclassified" : "Turn"}</span><strong>{turn.status === "unclassified" ? "Unclassified activity" : turn.status}</strong></header>
      {turn.prompt && <section className="acp-turn-section acp-turn-prompt"><span className="acp-activity-label">Prompt</span><MarkdownMessage source={turn.prompt.text} /></section>}
      {turn.currentAction && <section className="acp-turn-section acp-current-action"><span className="acp-activity-label">Current action</span><strong>{turn.currentAction}</strong></section>}
      {turn.blockingRequest && <section className="acp-turn-section acp-blocking-summary"><span className="acp-activity-label">Blocking decision</span><strong>{turn.blockingRequest.type === "permission" ? turn.blockingRequest.request.title : turn.blockingRequest.request.title}</strong><small>Decision required below. No option is selected automatically.</small></section>}
      {turn.finalResponse && <section className="acp-turn-section acp-turn-response"><span className="acp-activity-label">Final response</span><MarkdownMessage source={turn.finalResponse.text} /></section>}
      <details className="acp-raw-activity"><summary>Raw activity ({turn.activities.length}{projection.omittedActivities ? ", bounded" : ""})</summary><div>{turn.activities.map((activity) => {
        const activityId = activityRenderKey(activity, turn.activities);
        const target = { turnId: turn.id, activityId };
        return <div className="acp-activity-item" data-activity-id={activityId} key={activityId}><AcpActivityView activity={activity} inspectionTarget={target} onOpenReference={onOpenReference} onOpenDiff={onOpenDiff} /></div>;
      })}</div></details>
    </article>)}
  </div>;
}

function activityRenderKey(activity: AcpActivity, activities: readonly AcpActivity[]): string {
  const base = activityKey(activity);
  const occurrence = activities.slice(0, activities.indexOf(activity) + 1).filter((candidate) => activityKey(candidate) === base).length;
  return `${base}:${occurrence}`;
}

function activityKey(activity: AcpActivity): string {
  if ("id" in activity) return `${activity.type}:${activity.id}`;
  if (activity.type === "location") return `${activity.type}:${activity.path}:${activity.line ?? ""}:${activity.column ?? ""}`;
  if (activity.type === "unknown") return `${activity.type}:${activity.name}`;
  return activity.type;
}

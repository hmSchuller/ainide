import type { AcpActivity, AcpPendingRequest } from "@ainide/shared";
import { projectAcpTurns } from "../acp-turns";
import { AcpActivityView, type AcpInspectionTarget } from "./AcpActivityView";

interface AcpConversationStreamProps {
  history: readonly AcpActivity[];
  pendingRequests: readonly AcpPendingRequest[];
  onOpenReference: (path: string, line: number, column?: number, target?: AcpInspectionTarget) => void;
  onOpenDiff?: (path?: string, target?: AcpInspectionTarget) => void;
}

export function AcpConversationStream({ history, pendingRequests, onOpenReference, onOpenDiff }: AcpConversationStreamProps) {
  const projection = projectAcpTurns(history, pendingRequests);
  const streamActivities = projection.turns.flatMap((turn) => turn.activities.map((activity) => ({ activity, turnId: turn.id, legacy: turn.classification === "legacy" })));
  if (!streamActivities.length) return <p className="acp-history-empty">Prompt this session to start a provider conversation.</p>;
  const activityKeys = streamActivities.map((entry) => entry.activity);
  return <div className="acp-conversation-stream">
    {projection.omittedTurns > 0 && <p className="acp-history-bound">Showing the latest {projection.turns.length} turns; {projection.omittedTurns} older turns remain outside the live view.</p>}
    {streamActivities.map((entry, index) => {
      const activityId = activityRenderKey(entry.activity, activityKeys);
      const target = { turnId: entry.turnId, activityId };
      const showLegacyDivider = entry.legacy && (index === 0 || !streamActivities[index - 1]?.legacy);
      return <div className="acp-stream-entry" data-turn-id={entry.turnId} data-activity-id={activityId} key={`${entry.turnId}:${activityId}`}>
        {showLegacyDivider && <div className="acp-stream-divider">Earlier activity</div>}
        <AcpActivityView activity={entry.activity} inspectionTarget={target} onOpenReference={onOpenReference} onOpenDiff={onOpenDiff} />
      </div>;
    })}
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

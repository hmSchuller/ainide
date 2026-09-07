import type { AcpActivity, AcpPendingRequest } from "@ainide/shared";

export const ACP_MAX_RENDERED_ACTIVITIES = 400;
export const ACP_MAX_RENDERED_TURNS = 100;

export type AcpTurnStatus = "active" | "completed" | "failed" | "cancelled" | "unclassified";

export interface AcpTurnProjection {
  id: string;
  status: AcpTurnStatus;
  classification: "turn" | "legacy";
  prompt?: AcpActivity & { type: "message"; role: "user" };
  currentAction?: string;
  blockingRequest?: AcpPendingRequest;
  finalResponse?: AcpActivity & { type: "message"; role: "agent" };
  activities: AcpActivity[];
}

export interface AcpTurnProjectionResult {
  turns: AcpTurnProjection[];
  omittedTurns: number;
  omittedActivities: number;
}

export function projectAcpTurns(history: readonly AcpActivity[], pendingRequests: readonly AcpPendingRequest[] = [], limits: { maxTurns?: number; maxActivitiesPerTurn?: number } = {}): AcpTurnProjectionResult {
  const maxTurns = Math.max(1, limits.maxTurns ?? ACP_MAX_RENDERED_TURNS);
  const maxActivities = Math.max(1, limits.maxActivitiesPerTurn ?? ACP_MAX_RENDERED_ACTIVITIES);
  const turns: AcpTurnProjection[] = [];
  let current: AcpTurnProjection | undefined;
  let legacyNumber = 0;
  const begin = (activity: AcpActivity, classification: "turn" | "legacy"): AcpTurnProjection => ({
    id: classification === "turn" ? `turn-${activity.type === "message" ? activity.id : turns.length}` : `legacy-${legacyNumber++}`,
    status: classification === "legacy" ? "unclassified" : "active",
    classification,
    activities: [],
  });
  const finish = () => {
    if (!current) return;
    if (current.classification === "turn" && current.status === "active" && pendingRequests.length) current.blockingRequest = pendingRequests[pendingRequests.length - 1];
    turns.push(current);
    current = undefined;
  };

  for (const activity of history) {
    if (activity.type === "message" && activity.role === "user") {
      if ((current?.prompt) || current?.classification === "legacy") finish();
      if (!current) current = begin(activity, "turn");
    } else if (!current) current = begin(activity, "legacy");
    addActivity(current, activity);
    if (activity.type === "turn") {
      if (current.classification === "turn") current.status = activity.status;
      finish();
    }
  }
  finish();
  const active = [...turns].reverse().find((turn) => turn.classification === "turn" && turn.status === "active");
  if (active && pendingRequests.length) active.blockingRequest = pendingRequests[pendingRequests.length - 1];
  const omittedTurns = Math.max(0, turns.length - maxTurns);
  const visible = turns.slice(-maxTurns);
  const omittedActivities = visible.reduce((count, turn) => count + Math.max(0, turn.activities.length - maxActivities), 0);
  for (const turn of visible) turn.activities = turn.activities.slice(-maxActivities);
  return { turns: visible, omittedTurns, omittedActivities };
}

export function boundedAcpActivities(history: readonly AcpActivity[], max = ACP_MAX_RENDERED_ACTIVITIES): AcpActivity[] {
  return [...history].slice(-Math.max(1, max));
}

function addActivity(turn: AcpTurnProjection, activity: AcpActivity): void {
  turn.activities.push(activity);
  if (activity.type === "message" && activity.role === "user" && !turn.prompt) turn.prompt = activity as Extract<AcpActivity, { type: "message"; role: "user" }>;
  if (activity.type === "message" && activity.role === "agent" && !activity.thought) turn.finalResponse = activity as Extract<AcpActivity, { type: "message"; role: "agent" }>;
  if (activity.type === "tool_call" || activity.type === "terminal" || activity.type === "plan") turn.currentAction = deterministicAction(turn.activities);
}

function deterministicAction(activities: readonly AcpActivity[]): string | undefined {
  for (const activity of [...activities].reverse()) {
    if (activity.type === "tool_call" && activity.status === "running") return `Running ${activity.title}`;
    if (activity.type === "terminal" && activity.status === "running") return "Running provider terminal activity";
    if (activity.type === "plan" && (activity.status === "running" || activity.status === "pending")) return "Provider plan is in progress";
    if (activity.type === "tool_call" || activity.type === "terminal" || activity.type === "plan") return undefined;
  }
  return undefined;
}

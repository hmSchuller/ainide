export interface AcpHistoryScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface AcpHistoryFollowState {
  following: boolean;
  hasNewActivity: boolean;
}

export interface AcpHistoryActivityTransition {
  state: AcpHistoryFollowState;
  shouldScroll: boolean;
}

export const ACP_HISTORY_BOTTOM_TOLERANCE = 8;

export function bottomDistance(metrics: AcpHistoryScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop);
}

export function isNearBottom(metrics: AcpHistoryScrollMetrics, tolerance = ACP_HISTORY_BOTTOM_TOLERANCE): boolean {
  return bottomDistance(metrics) <= Math.max(0, tolerance);
}

export function initialAcpHistoryFollowState(): AcpHistoryFollowState {
  return { following: true, hasNewActivity: false };
}

export function stateAfterAcpHistoryScroll(
  metrics: AcpHistoryScrollMetrics,
  previous: AcpHistoryFollowState,
  tolerance = ACP_HISTORY_BOTTOM_TOLERANCE,
): AcpHistoryFollowState {
  if (isNearBottom(metrics, tolerance)) return { following: true, hasNewActivity: false };
  return { following: false, hasNewActivity: previous.hasNewActivity };
}

export function stateAfterAcpHistoryActivity(previous: AcpHistoryFollowState): AcpHistoryActivityTransition {
  if (previous.following) return { state: { following: true, hasNewActivity: false }, shouldScroll: true };
  return { state: { following: false, hasNewActivity: true }, shouldScroll: false };
}

export function resumedAcpHistoryFollowState(): AcpHistoryFollowState {
  return { following: true, hasNewActivity: false };
}

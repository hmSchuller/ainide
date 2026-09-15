import type { AcpActivity, AcpServerEvent, AcpSession } from "@ainide/shared";

export type { AcpTurnProjection, AcpTurnProjectionResult, AcpTurnStatus } from "./acp-turns";
export { boundedAcpActivities, projectAcpTurns } from "./acp-turns";

const MAX_HISTORY_ITEMS = 2_000;
const MAX_ACTIVITY_TEXT = 1_000_000;

export interface AcpClientState {
  projectId?: string;
  sessions: AcpSession[];
  history: Record<string, AcpActivity[]>;
  lastSequences: Record<string, number>;
  queued: Record<string, Array<Extract<AcpServerEvent, { type: "session_event" | "session_removed" }>>>;
}

export const emptyAcpClientState = (): AcpClientState => ({ sessions: [], history: {}, lastSequences: {}, queued: {} });

export function applyAcpServerEvent(state: AcpClientState, event: AcpServerEvent): AcpClientState {
  if (event.type === "snapshot") {
    return {
      projectId: event.projectId || undefined,
      sessions: event.sessions,
      history: Object.fromEntries(event.sessions.map((session) => [session.id, [...(event.history[session.id] ?? [])].slice(-MAX_HISTORY_ITEMS)])),
      lastSequences: event.sequences ?? {},
      queued: {},
    };
  }
  if (state.projectId !== undefined && state.projectId !== event.projectId) return state;
  if (state.projectId === undefined) return state;
  const lastSequence = state.lastSequences[event.sessionId] ?? 0;
  if (event.sequence <= lastSequence) return state;
  const queue = [...(state.queued[event.sessionId] ?? []), event].sort((a, b) => a.sequence - b.sequence);
  let next: AcpClientState = { ...state, queued: { ...state.queued, [event.sessionId]: queue } };
  while (true) {
    const currentSequence = next.lastSequences[event.sessionId] ?? 0;
    const pending = next.queued[event.sessionId] ?? [];
    const ready = pending.find((candidate) => candidate.sequence === currentSequence + 1);
    if (!ready) break;
    next = applySequencedEvent(next, ready);
    const remaining = pending.filter((candidate) => candidate !== ready);
    const queued = { ...next.queued };
    if (remaining.length) queued[event.sessionId] = remaining;
    else delete queued[event.sessionId];
    next = { ...next, queued };
  }
  return next;
}

function applySequencedEvent(state: AcpClientState, event: Extract<AcpServerEvent, { type: "session_event" | "session_removed" }>): AcpClientState {
  const lastSequences = { ...state.lastSequences, [event.sessionId]: event.sequence };
  if (event.type === "session_removed") {
    const history = { ...state.history };
    delete history[event.sessionId];
    return { ...state, sessions: state.sessions.filter((session) => session.id !== event.sessionId), history, lastSequences };
  }
  const sessionEvent = event.event;
  if (sessionEvent.type === "status") {
    return { ...state, sessions: upsertSession(state.sessions, sessionEvent.session), lastSequences };
  }
  if (sessionEvent.type === "activity") {
    return { ...state, history: { ...state.history, [event.sessionId]: appendActivity(state.history[event.sessionId] ?? [], sessionEvent.activity) }, lastSequences };
  }
  if (sessionEvent.type === "subagent") {
    const session = state.sessions.find((candidate) => candidate.id === event.sessionId);
    if (!session) return { ...state, lastSequences };
    const subagents = [...(session.subagents ?? [])];
    const index = subagents.findIndex((subagent) => subagent.providerId === sessionEvent.subagent.providerId && subagent.id === sessionEvent.subagent.id);
    if (index < 0) subagents.push(sessionEvent.subagent);
    else subagents[index] = sessionEvent.subagent;
    return { ...state, sessions: upsertSession(state.sessions, { ...session, subagents }), lastSequences };
  }
  const session = state.sessions.find((candidate) => candidate.id === event.sessionId);
  if (!session) return { ...state, lastSequences };
  if (sessionEvent.type === "config") {
    return { ...state, sessions: upsertSession(state.sessions, { ...session, configOptions: sessionEvent.options }), lastSequences };
  }
  if (sessionEvent.type === "request") {
    if (session.pendingRequests.some((request) => request.request.requestId === sessionEvent.request.request.requestId)) return { ...state, lastSequences };
    return { ...state, sessions: upsertSession(state.sessions, { ...session, pendingRequests: [...session.pendingRequests, sessionEvent.request] }), lastSequences };
  }
  return {
    ...state,
    sessions: upsertSession(state.sessions, { ...session, pendingRequests: session.pendingRequests.filter((request) => request.request.requestId !== sessionEvent.requestId) }),
    lastSequences,
  };
}

function upsertSession(sessions: AcpSession[], session: AcpSession): AcpSession[] {
  const index = sessions.findIndex((candidate) => candidate.id === session.id);
  if (index < 0) return [...sessions, session];
  return sessions.map((candidate, candidateIndex) => candidateIndex === index ? session : candidate);
}

function appendActivity(history: AcpActivity[], activity: AcpActivity): AcpActivity[] {
  if (activity.type === "message") {
    const index = history.findIndex((item) => item.type === "message" && item.id === activity.id && item.role === activity.role);
    const existing = history[index];
    if (index >= 0 && existing?.type === "message") {
      return [...history.slice(0, index), { ...existing, text: `${existing.text}${activity.text}`.slice(-MAX_ACTIVITY_TEXT) }, ...history.slice(index + 1)];
    }
  }
  if (activity.type === "tool_call") {
    const index = history.findIndex((item) => item.type === "tool_call" && item.id === activity.id);
    const existing = history[index];
    if (index >= 0 && existing?.type === "tool_call") {
      return [...history.slice(0, index), {
        ...existing,
        ...activity,
        title: coalescedToolCallTitle(existing.title, activity.title, activity.id),
        input: activity.input ?? existing.input,
        output: activity.output ?? existing.output,
      }, ...history.slice(index + 1)];
    }
  }
  return [...history, activity].slice(-MAX_HISTORY_ITEMS);
}

function coalescedToolCallTitle(existingTitle: string, incomingTitle: string, toolId: string): string {
  if (incomingTitle === "Tool call" || incomingTitle === `Tool ${toolId}`) return existingTitle;
  return incomingTitle || existingTitle;
}

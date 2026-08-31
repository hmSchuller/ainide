import type { AcpActivity, AcpServerEvent, AcpSession } from "@ainide/shared";

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
  const last = history[history.length - 1];
  if (last?.type === "message" && activity.type === "message" && last.id === activity.id && last.role === activity.role) {
    return [...history.slice(0, -1), { ...last, text: `${last.text}${activity.text}`.slice(-MAX_ACTIVITY_TEXT) }];
  }
  if (last?.type === "tool_call" && activity.type === "tool_call" && last.id === activity.id) {
    return [...history.slice(0, -1), { ...last, ...activity, input: activity.input ?? last.input, output: activity.output ?? last.output }];
  }
  return [...history, activity].slice(-MAX_HISTORY_ITEMS);
}

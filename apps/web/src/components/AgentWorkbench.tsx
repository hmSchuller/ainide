import { useState } from "react";
import type { AcpActivity, AcpElicitationValue, AcpPendingRequest, AcpRequestResponse, AcpSession, TerminalSession } from "@ainide/shared";
import { authenticateAcpSession, cancelAcpSession, closeAcpSession, closeTerminal, promptAcpSession, renameAcpSession, renameTerminal, respondToAcpRequest, setAcpConfigOption } from "../api";
import { agentTerminals } from "../terminal-ownership";
import { useAppStore } from "../store";
import { TerminalView } from "./TerminalPanel";
import { promptContextFromReferences } from "../references";

interface AgentWorkbenchProps {
  onNewAgent: () => void;
  onOpenReference: (path: string, line: number, column?: number) => void;
}

export type AgentEntry =
  | { kind: "pty"; session: TerminalSession }
  | { kind: "acp"; session: AcpSession };

const EMPTY_DRAFT = { text: "", references: [] };
const EMPTY_HISTORY: AcpActivity[] = [];

function isLive(entry: AgentEntry): boolean {
  return entry.kind === "pty" ? entry.session.alive : entry.session.status === "live" || entry.session.status === "waiting";
}

export function combinedAgentEntries(terminals: TerminalSession[], acpSessions: AcpSession[], projectId?: string): AgentEntry[] {
  return [
    ...agentTerminals(terminals, projectId).map((session) => ({ kind: "pty" as const, session })),
    ...acpSessions.filter((session) => session.projectId === projectId).map((session) => ({ kind: "acp" as const, session })),
  ];
}

function SessionStatus({ entry }: { entry: AgentEntry }) {
  const label = entry.kind === "pty" ? (entry.session.alive ? "live" : "exited") : entry.session.status.replaceAll("_", " ");
  return <span className={`agent-status ${entry.kind === "pty" ? (entry.session.alive ? "live" : "exited") : entry.session.status === "live" ? "live" : ""}`}><i />{label}</span>;
}

function ActivityView({ activity, onOpenReference }: { activity: AcpActivity; onOpenReference: AgentWorkbenchProps["onOpenReference"] }) {
  if (activity.type === "message") {
    if (activity.thought) return <details className="acp-thought"><summary><span className="acp-activity-label">thinking</span></summary><p>{activity.text}</p></details>;
    return <div className={`acp-message ${activity.role}`}><span className="acp-activity-label">{activity.role}</span><p>{activity.text}</p></div>;
  }
  if (activity.type === "tool_call") return <details className={`acp-tool ${activity.status}`} open={activity.status === "running"}><summary><span>{activity.title}</span><small>{activity.status}</small></summary>{activity.input && <pre>{activity.input}</pre>}{activity.output && <pre>{activity.output}</pre>}</details>;
  if (activity.type === "plan") return <div className="acp-plan"><span className="acp-activity-label">plan{activity.status ? ` · ${activity.status}` : ""}</span><p>{activity.text}</p></div>;
  if (activity.type === "location") return <button className="acp-location" onClick={() => onOpenReference(activity.path, activity.line ?? 1, activity.column)}>Open {activity.path}{activity.line ? `:${activity.line}` : ""}</button>;
  if (activity.type === "diff") return <details className="acp-diff"><summary>Diff{activity.path ? ` · ${activity.path}` : ""}</summary><pre>{activity.diff}</pre></details>;
  if (activity.type === "terminal") return <details className="acp-terminal-activity"><summary>Terminal {activity.status ?? "output"}</summary><pre>{activity.output ?? "No output retained"}</pre></details>;
  if (activity.type === "usage") return <small className="acp-usage">Usage: {activity.totalTokens ?? "?"} tokens</small>;
  if (activity.type === "turn") return <div className={`acp-turn ${activity.status}`}>{activity.status}{activity.message ? ` · ${activity.message}` : ""}</div>;
  return <details className="acp-unknown"><summary>Unknown provider activity · {activity.name}</summary><pre>{JSON.stringify(activity.data, null, 2)}</pre></details>;
}

function ConfigControls({ session }: { session: AcpSession }) {
  const token = useAppStore((state) => state.token);
  const updateAcpSession = useAppStore((state) => state.updateAcpSession);
  const setNotice = useAppStore((state) => state.setNotice);
  if (!session.configOptions.length) return null;
  const update = async (id: string, value: string | boolean) => {
    try {
      const options = await setAcpConfigOption(session.id, id, value, token);
      updateAcpSession(session.id, { configOptions: options });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Provider option could not be changed", "error");
    }
  };
  return <div className="acp-options" aria-label="Provider options">{session.configOptions.map((option) => option.type === "boolean" ? <label key={option.id} className="acp-option"><span>{option.label}</span><input type="checkbox" checked={option.currentValue === true} onChange={(event) => void update(option.id, event.target.checked)} /></label> : <label key={option.id} className="acp-option"><span>{option.label}</span><select value={typeof option.currentValue === "string" ? option.currentValue : ""} onChange={(event) => void update(option.id, event.target.value)}><option value="" disabled>Select</option>{(option.choices ?? []).map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></label>)}</div>;
}

function AuthPanel({ session }: { session: AcpSession }) {
  const token = useAppStore((state) => state.token);
  const updateAcpSession = useAppStore((state) => state.updateAcpSession);
  const setNotice = useAppStore((state) => state.setNotice);
  if (session.status !== "auth_required") return null;
  const authenticate = async (methodId: string) => {
    try { updateAcpSession(session.id, await authenticateAcpSession(session.id, methodId, token)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Provider authentication failed", "error"); }
  };
  return <div className="acp-auth" role="status"><strong>Authentication required</strong><span>{session.error ?? "Authenticate this provider before prompting."}</span><div>{session.authMethods.map((method) => method.type === "agent" ? <button key={method.id} onClick={() => void authenticate(method.id)}>{method.label}</button> : <span key={method.id} className="acp-auth-terminal">{method.label}: use the provider's terminal login flow</span>)}</div></div>;
}

function ElicitationForm({ session, request }: { session: AcpSession; request: Extract<AcpPendingRequest, { type: "elicitation" }> }) {
  const token = useAppStore((state) => state.token);
  const setNotice = useAppStore((state) => state.setNotice);
  const [values, setValues] = useState<Record<string, AcpElicitationValue>>({});
  const respond = async (response: AcpRequestResponse) => {
    try { await respondToAcpRequest(session.id, request.request.requestId, response, token); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Elicitation response failed", "error"); }
  };
  const valid = request.request.fields.every((field) => !field.required || (values[field.id] !== undefined && values[field.id] !== ""));
  const titleId = `elicitation-title-${request.request.requestId}`;
  return <fieldset className="acp-request acp-elicitation" role="dialog" aria-labelledby={titleId}><legend id={titleId}>{request.request.title}</legend>{request.request.description && <p>{request.request.description}</p>}{request.request.fields.map((field) => <label key={field.id}><span>{field.label}{field.required ? " *" : ""}</span>{field.type === "boolean" ? <input type="checkbox" checked={values[field.id] === true} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.checked }))} /> : field.type === "select" ? <select value={typeof values[field.id] === "string" ? values[field.id] as string : ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}><option value="">Select</option>{(field.choices ?? []).map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select> : <input type={field.type === "number" ? "number" : "text"} value={values[field.id] === undefined ? "" : String(values[field.id])} onChange={(event) => setValues((current) => ({ ...current, [field.id]: field.type === "number" ? Number(event.target.value) : event.target.value }))} />}</label>)}<div className="acp-request-actions"><button className="primary-button compact" disabled={!valid} onClick={() => void respond({ action: "accept", content: values })}>Submit</button><button onClick={() => void respond({ action: "decline" })}>Decline</button><button onClick={() => void respond({ action: "cancel" })}>Cancel</button></div></fieldset>;
}

function PendingRequest({ session, request }: { session: AcpSession; request: AcpPendingRequest }) {
  const token = useAppStore((state) => state.token);
  const setNotice = useAppStore((state) => state.setNotice);
  const respond = async (response: AcpRequestResponse) => {
    try { await respondToAcpRequest(session.id, request.request.requestId, response, token); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Provider request response failed", "error"); }
  };
  if (request.type === "elicitation") return <ElicitationForm session={session} request={request} />;
  const titleId = `permission-title-${request.request.requestId}`;
  return <fieldset className="acp-request acp-permission" role="dialog" aria-labelledby={titleId}><legend id={titleId}>{request.request.title}</legend>{request.request.description && <p>{request.request.description}</p>}<div className="acp-request-actions">{request.request.options.map((option) => <button className="primary-button compact" key={option.id} onClick={() => void respond({ outcome: "selected", optionId: option.id })}>{option.label}</button>)}<button onClick={() => void respond({ outcome: "cancelled" })}>Reject</button></div></fieldset>;
}

function AcpConversation({ session, onOpenReference }: { session: AcpSession; onOpenReference: AgentWorkbenchProps["onOpenReference"] }) {
  const token = useAppStore((state) => state.token);
  const history = useAppStore((state) => state.acpHistory[session.id] ?? EMPTY_HISTORY);
  const draft = useAppStore((state) => state.acpDrafts[session.id] ?? EMPTY_DRAFT);
  const updateAcpDraft = useAppStore((state) => state.updateAcpDraft);
  const clearAcpDraft = useAppStore((state) => state.clearAcpDraft);
  const setNotice = useAppStore((state) => state.setNotice);
  const submit = async () => {
    const text = draft.text.trim() || (draft.references.length ? "Review the selected references." : "");
    if (!text || session.activePrompt || session.status === "auth_required") return;
    try {
      await promptAcpSession(session.id, { text, ...(draft.references.length ? { context: promptContextFromReferences(draft.references) } : {}) }, token);
      clearAcpDraft(session.id);
    } catch (error) { setNotice(error instanceof Error ? error.message : "ACP prompt failed", "error"); }
  };
  const cancel = async () => {
    try { await cancelAcpSession(session.id, token); }
    catch (error) { setNotice(error instanceof Error ? error.message : "ACP cancellation failed", "error"); }
  };
  return <div className="acp-conversation">
    <header className="acp-conversation-header"><div><span className="eyebrow">{session.providerLabel}</span><strong>{session.title}</strong></div><SessionStatus entry={{ kind: "acp", session }} /></header>
    <ConfigControls session={session} />
    <AuthPanel session={session} />
    <div className="acp-history" aria-live="polite">{history.length ? history.map((activity, index) => <ActivityView activity={activity} onOpenReference={onOpenReference} key={`${activity.type}-${"id" in activity ? activity.id : index}-${index}`} />) : <p className="acp-history-empty">Prompt this session to start a provider conversation.</p>}</div>
    {session.pendingRequests.map((request) => <PendingRequest key={request.request.requestId} session={session} request={request} />)}
    <div className="acp-composer"><textarea value={draft.text} onChange={(event) => updateAcpDraft(session.id, { text: event.target.value })} placeholder="Prompt this ACP session..." onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void submit(); } }} /><div className="acp-composer-footer"><span>{draft.references.length ? `${draft.references.length} reference${draft.references.length === 1 ? "" : "s"} attached` : "References can be attached from the dock"}</span><div>{session.activePrompt ? <button onClick={() => void cancel()}>Cancel turn</button> : <button className="primary-button compact" onClick={() => void submit()} disabled={!draft.text.trim() && !draft.references.length}>Send ⌘↵</button>}</div></div></div>
  </div>;
}

export function AgentWorkbench({ onNewAgent, onOpenReference }: AgentWorkbenchProps) {
  const token = useAppStore((state) => state.token);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const terminals = useAppStore((state) => state.terminals);
  const acpSessions = useAppStore((state) => state.acpSessions);
  const focusedSessionId = useAppStore((state) => state.focusedSessionId);
  const pinnedSessionId = useAppStore((state) => state.pinnedSessionId);
  const referenceTargetId = useAppStore((state) => state.referenceTargetId);
  const setFocusedSession = useAppStore((state) => state.setFocusedSession);
  const setPinnedSession = useAppStore((state) => state.setPinnedSession);
  const setReferenceTarget = useAppStore((state) => state.setReferenceTarget);
  const updateTerminal = useAppStore((state) => state.updateTerminal);
  const removeTerminal = useAppStore((state) => state.removeTerminal);
  const setAcpSessions = useAppStore((state) => state.setAcpSessions);
  const setNotice = useAppStore((state) => state.setNotice);
  const agents = combinedAgentEntries(terminals, acpSessions, activeProjectId);
  const focused = agents.find((entry) => entry.session.id === focusedSessionId) ?? agents[0];
  const pinned = agents.find((entry) => entry.session.id === pinnedSessionId && entry.session.id !== focused?.session.id);
  const visibleAgents = [focused, pinned].filter((entry): entry is AgentEntry => Boolean(entry));
  const liveAgents = agents.filter(isLive);

  const close = async (entry: AgentEntry) => {
    if (isLive(entry) && !window.confirm(`Close the running ${entry.session.title} agent?`)) return;
    try {
      if (entry.kind === "acp") await closeAcpSession(entry.session.id, token);
      else await closeTerminal(entry.session.id, token);
    } catch { /* A disconnected process is already closed. */ }
    if (entry.kind === "acp") setAcpSessions(acpSessions.filter((session) => session.id !== entry.session.id));
    else removeTerminal(entry.session.id);
    if (focusedSessionId === entry.session.id) setFocusedSession(undefined);
    if (pinnedSessionId === entry.session.id) setPinnedSession(undefined);
    if (referenceTargetId === entry.session.id) setReferenceTarget(undefined);
  };

  const rename = async (entry: AgentEntry) => {
    const title = window.prompt("Rename agent session", entry.session.title);
    if (!title?.trim() || !token) return;
    try {
      if (entry.kind === "acp") {
        const updated = await renameAcpSession(entry.session.id, title, token);
        useAppStore.getState().updateAcpSession(entry.session.id, updated);
      } else {
        const updated = await renameTerminal(entry.session.id, title, token);
        updateTerminal(entry.session.id, updated);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Agent rename failed", "error"); }
  };

  const focus = (entry: AgentEntry) => {
    setFocusedSession(entry.session.id);
    setReferenceTarget(isLive(entry) ? entry.session.id : referenceTargetId);
  };

  return <section className="agent-workbench" aria-label="Agents workbench">
    <aside className="agent-navigator">
      <header className="agent-navigator-header"><div><span className="eyebrow">AGENT WORKBENCH</span><strong>{agents.length} {agents.length === 1 ? "agent" : "agents"}</strong></div><button className="primary-button compact" onClick={onNewAgent}>+ New agent</button></header>
      <div className="agent-navigator-body"><section className="session-group"><div className="session-group-heading"><span>AGENTS</span><b>{agents.length}</b></div>{agents.length === 0 ? <div className="session-empty">No agent sessions yet.<button onClick={onNewAgent}>Start an agent</button></div> : agents.map((entry) => <div className={`session-row ${entry.session.id === focused?.session.id ? "selected" : ""}`} key={`${entry.kind}-${entry.session.id}`}>
        <button className="session-select" onClick={() => focus(entry)} title={`Focus ${entry.session.title}`}><span className="session-title">{entry.session.title}</span><span className="session-provider">{entry.kind === "acp" ? entry.session.providerLabel : entry.session.command}</span><SessionStatus entry={entry} /></button>
        <div className="session-actions"><button onClick={() => { setFocusedSession(entry.session.id); setReferenceTarget(isLive(entry) ? entry.session.id : undefined); }} aria-label={`Target ${entry.session.title}`} title="Use as handoff target">◎</button><button onClick={() => setPinnedSession(pinned?.session.id === entry.session.id ? undefined : entry.session.id)} aria-label={`${pinned?.session.id === entry.session.id ? "Unpin" : "Pin"} ${entry.session.title}`} title={pinned?.session.id === entry.session.id ? "Unpin agent" : "Pin agent"}>{pinned?.session.id === entry.session.id ? "▣" : "□"}</button><button onClick={() => void rename(entry)} aria-label={`Rename ${entry.session.title}`} title="Rename agent">✎</button><button onClick={() => void close(entry)} aria-label={`Close ${entry.session.title}`} title="Close agent">×</button></div>
      </div>)}</section></div>
      <footer className="agent-target"><label htmlFor="agent-target">HANDOFF TARGET</label><select id="agent-target" value={referenceTargetId ?? ""} onChange={(event) => setReferenceTarget(event.target.value || undefined)}><option value="">No live agent selected</option>{liveAgents.map((entry) => <option value={entry.session.id} key={`${entry.kind}-${entry.session.id}`}>{entry.session.title}{entry.kind === "acp" ? ` · ${entry.session.providerLabel}` : ""}</option>)}</select><span>{referenceTargetId && liveAgents.some((entry) => entry.session.id === referenceTargetId) ? "Ready for reference insertion" : "Choose a live agent from here or Edit"}</span></footer>
    </aside>
    <div className="agent-stage">{visibleAgents.length ? <div className={`agent-terminal-grid ${visibleAgents.length > 1 ? "split" : ""}`}>{visibleAgents.map((entry) => <article className={`agent-terminal-card ${entry.kind === "acp" ? "acp-card" : ""}`} key={`${entry.kind}-${entry.session.id}`}><header><div><span className="eyebrow">{entry.session.id === focused?.session.id ? "FOCUSED SESSION" : "PINNED SESSION"}</span><strong>{entry.session.title}</strong></div><SessionStatus entry={entry} /></header>{entry.kind === "acp" ? <AcpConversation session={entry.session} onOpenReference={onOpenReference} /> : <TerminalView session={entry.session} onOpenReference={onOpenReference} />}</article>)}</div> : <div className="agent-empty"><span className="agent-empty-mark">◎</span><p className="eyebrow">NO AGENTS RUNNING</p><h2>Start a parallel work window.</h2><p>Use named sessions for implementation, planning, or any other task you want to watch.</p><button className="primary-button" onClick={onNewAgent}>Start first agent</button></div>}</div>
  </section>;
}

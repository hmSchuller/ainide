import type { AcpActivity, AcpElicitationValue, AcpPendingRequest, AcpRequestResponse, AcpSession, AcpSubagent, FileEntry, TerminalSession } from "@ainide/shared";
import { useEffect, useRef, useState } from "react";
import { type AcpCommandSuggestion, filterAcpSuggestions, insertAcpCommand, matchAcpCommandToken, moveAcpCommandIndex } from "../acp-command-autocomplete";
import { ACP_SEND_LABEL, type AcpQueuedPrompt, acpComposerKeyAction, acpComposerState, canDispatchAcpPrompt, dispatchAcpPrompt, enqueueAcpPrompt, moveQueuedAcpPrompt, removeQueuedAcpPrompt } from "../acp-composer";
import { filterAcpFiles, insertAcpFile, matchAcpFileToken, moveAcpFileIndex } from "../acp-file-autocomplete";
import { initialAcpHistoryFollowState, resumedAcpHistoryFollowState, stateAfterAcpHistoryActivity, stateAfterAcpHistoryScroll } from "../acp-history-scroll";
import { dispatchAcpRecovery, dispatchAcpRollover, freshAcpSessionTitle } from "../acp-rollover";
import { authenticateAcpSession, cancelAcpSession, closeAcpSession, closeTerminal, createAcpSession, promptAcpSession, readFile, renameAcpSession, renameTerminal, respondToAcpRequest, rolloverAcpSession, searchFiles, setAcpConfigOption } from "../api";
import { language } from "../file-language";
import type { AgentReferenceLocation } from "../inspection-navigation";
import type { AcpPromptDraft } from "../project-ui";
import { captureMentionedFileReference, removeGeneratedReferenceMention } from "../references";
import { useAppStore } from "../store";
import { agentTerminals } from "../terminal-ownership";
import { AcpActivityView } from "./AcpActivityView";
import { AcpTurnNarrative } from "./AcpTurnNarrative";
import { TerminalView } from "./TerminalPanel";

interface AgentWorkbenchProps {
  onNewAgent: () => void;
  onOpenReference: (path: string, line: number, column?: number, source?: AgentReferenceLocation) => void;
  onOpenDiff?: (path?: string, source?: AgentReferenceLocation) => void;
}

export type AgentEntry =
  | { kind: "pty"; session: TerminalSession }
  | { kind: "acp"; session: AcpSession };

const EMPTY_DRAFT: AcpPromptDraft = { text: "", references: [] };
const EMPTY_HISTORY: AcpActivity[] = [];
const historyFollowBySession = new Map<string, ReturnType<typeof initialAcpHistoryFollowState>>();

export function moveRovingIndex(index: number, direction: -1 | 1, length: number): number {
  if (length < 1) return -1;
  return (index + direction + length) % length;
}

function isLive(entry: AgentEntry): boolean {
  return entry.kind === "pty" ? entry.session.alive : entry.session.status === "live" || entry.session.status === "waiting";
}

function sameDraft(left: AcpPromptDraft, right: AcpPromptDraft): boolean {
  return left.text === right.text && JSON.stringify(left.references) === JSON.stringify(right.references);
}

export function combinedAgentEntries(terminals: TerminalSession[], acpSessions: AcpSession[], projectId?: string): AgentEntry[] {
  return [
    ...agentTerminals(terminals, projectId).map((session) => ({ kind: "pty" as const, session })),
    ...acpSessions.filter((session) => session.projectId === projectId).map((session) => ({ kind: "acp" as const, session })),
  ];
}

function SessionStatus({ entry }: { entry: AgentEntry }) {
  const status = entry.kind === "pty" ? (entry.session.alive ? "live" : "exited") : entry.session.status.replaceAll("_", " ");
  return <span className={`agent-status ${status === "live" ? "live" : status === "reconnecting" ? "reconnecting" : status === "exited" ? "exited" : ""}`}><i />{status}</span>;
}

export function SubagentList({ subagents }: { subagents?: readonly AcpSubagent[] }) {
  if (!subagents?.length) return null;
  return <section className="acp-subagents" aria-label="Provider-reported subordinate activity"><header><span className="acp-activity-label">Subordinate activity</span><small>Reported by provider · no controls</small></header><ul>{subagents.map((subagent) => <li key={`${subagent.providerId}\u0000${subagent.id}`}><span className="acp-subagent-identity"><strong>{subagent.name ?? subagent.role ?? subagent.providerId}</strong>{subagent.role && subagent.name && <small>{subagent.role}</small>}</span>{subagent.activity && <span className="acp-subagent-activity">{subagent.activity}</span>}{subagent.state && <span className="acp-subagent-state">{subagent.state}</span>}</li>)}</ul></section>;
}

export const ActivityView = AcpActivityView;

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
  // Layout container naming a control group; a fieldset would change layout semantics
  return (
    /* biome-ignore lint/a11y/useSemanticElements: grouped option controls, not a form field group */
    <div className="acp-options" role="group" aria-label="Provider options">{session.configOptions.map((option) => option.type === "boolean" ? <label key={option.id} className="acp-option"><span>{option.label}</span><input type="checkbox" checked={option.currentValue === true} onChange={(event) => void update(option.id, event.target.checked)} /></label> : <label key={option.id} className="acp-option"><span>{option.label}</span><select value={typeof option.currentValue === "string" ? option.currentValue : ""} onChange={(event) => void update(option.id, event.target.value)}><option value="" disabled>Select</option>{(option.choices ?? []).map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></label>)}</div>
  );
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
  return <div className="acp-auth" role="alert" aria-label={`Authentication required for ${session.title}`}><strong>Authentication required</strong><span>Provider: {session.providerLabel}</span><span>{session.error ?? "Authenticate this provider before prompting."}</span><div>{session.authMethods.map((method) => method.type === "agent" ? <button type="button" key={method.id} onClick={() => void authenticate(method.id)}>{method.label}{method.description ? ` · ${method.description}` : ""}</button> : <span key={method.id} className="acp-auth-terminal">{method.label}: use the provider's terminal login flow</span>)}</div><small>Authentication is provider-owned; ainide never collects credentials.</small></div>;
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
  return <fieldset className="acp-request acp-elicitation" role="dialog" aria-labelledby={titleId}><legend id={titleId}>Input required · {request.request.title}</legend><p className="acp-request-note">Only this session is waiting. No value is submitted automatically.</p>{request.request.description && <p>{request.request.description}</p>}{request.request.fields.map((field) => { const controlId = `elicitation-field-${request.request.requestId}-${field.id}`; return <label key={field.id} htmlFor={controlId}><span>{field.label}{field.required ? " *" : ""}</span>{field.type === "boolean" ? <input id={controlId} type="checkbox" checked={values[field.id] === true} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.checked }))} /> : field.type === "select" ? <select id={controlId} value={typeof values[field.id] === "string" ? values[field.id] as string : ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}><option value="">Select</option>{(field.choices ?? []).map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select> : <input id={controlId} type={field.type === "number" ? "number" : "text"} value={values[field.id] === undefined ? "" : String(values[field.id])} onChange={(event) => setValues((current) => ({ ...current, [field.id]: field.type === "number" ? Number(event.target.value) : event.target.value }))} />}</label>; })}<div className="acp-request-actions"><button type="button" className="primary-button compact" disabled={!valid} onClick={() => void respond({ action: "accept", content: values })}>Submit</button><button type="button" onClick={() => void respond({ action: "decline" })}>Decline</button><button type="button" onClick={() => void respond({ action: "cancel" })}>Cancel</button></div></fieldset>;
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
  return <fieldset className="acp-request acp-permission" role="dialog" aria-labelledby={titleId}><legend id={titleId}>Permission required · {request.request.title}</legend><p className="acp-request-note">This provider operation is paused for your decision. Nothing is approved automatically.</p>{request.request.description && <p>{request.request.description}</p>}<div className="acp-request-actions">{request.request.options.map((option) => <button type="button" className="primary-button compact" key={option.id} onClick={() => void respond({ outcome: "selected", optionId: option.id })}>{option.label}</button>)}<button type="button" onClick={() => void respond({ outcome: "cancelled" })}>Reject</button></div></fieldset>;
}

export function AcpConversation({ session, onOpenReference, onOpenDiff }: { session: AcpSession; onOpenReference: AgentWorkbenchProps["onOpenReference"]; onOpenDiff?: AgentWorkbenchProps["onOpenDiff"] }) {
  const token = useAppStore((state) => state.token);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const directories = useAppStore((state) => state.directories);
  const history = useAppStore((state) => state.acpHistory[session.id] ?? EMPTY_HISTORY);
  const draft = useAppStore((state) => state.acpDrafts[session.id] ?? EMPTY_DRAFT);
  const updateAcpDraft = useAppStore((state) => state.updateAcpDraft);
  const clearAcpDraft = useAppStore((state) => state.clearAcpDraft);
  const setAcpDraft = useAppStore((state) => state.setAcpDraft);
  const setNotice = useAppStore((state) => state.setNotice);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const fileSearchGenerationRef = useRef(0);
  const fileSelectionGenerationRef = useRef(0);
  const pendingFileReadsRef = useRef(new Set<number>());
  const caretRef = useRef(draft.text.length);
  const [caret, setCaret] = useState(draft.text.length);
  const [activeCompletionIndex, setActiveCompletionIndex] = useState(0);
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const [fileSuggestions, setFileSuggestions] = useState<FileEntry[]>([]);
  const [fileReadPending, setFileReadPending] = useState(false);
  const [historyFollowState, setHistoryFollowState] = useState(() => historyFollowBySession.get(session.id) ?? initialAcpHistoryFollowState());
  const [queuedPrompts, setQueuedPrompts] = useState<AcpQueuedPrompt[]>([]);
  const loadedWorkspaceFiles = Object.values(directories).flatMap((directory) => directory.entries);
  const commandMatch = matchAcpCommandToken(draft.text, Math.min(caret, draft.text.length));
  const fileMatch = matchAcpFileToken(draft.text, Math.min(caret, draft.text.length));
  const commandSuggestions = commandMatch && !fileMatch ? filterAcpSuggestions(session.availableCommands, commandMatch.query) : [];
  const commandListId = `acp-command-list-${session.id}`;
  const fileListId = `acp-file-list-${session.id}`;
  const completionCount = fileMatch ? fileSuggestions.length : commandSuggestions.length;
  const completionOpen = !completionDismissed && completionCount > 0;
  const completionListId = fileMatch ? fileListId : commandListId;

  const setCurrentCaret = (value: number) => {
    caretRef.current = value;
    setCaret(value);
  };

  useEffect(() => {
    setCaret((current) => {
      const next = Math.min(current, draft.text.length);
      caretRef.current = next;
      return next;
    });
  }, [draft.text.length]);
  // The completion-context deps are the reset TRIGGERS; the callback always
  // sets the index back to the first suggestion.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps re-trigger the completion-index reset
  useEffect(() => {
    setActiveCompletionIndex(0);
  }, [commandMatch?.query, fileMatch?.query, fileMatch?.start]);
  useEffect(() => {
    setActiveCompletionIndex((current) => Math.min(current, Math.max(0, completionCount - 1)));
  }, [completionCount]);

  // fileMatch sub-fields and caret/directories/draft.text are intentionally
  // narrowed TRIGGERS limiting re-searches; the body re-validates via getState.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sub-field deps act as narrowed re-search triggers
  useEffect(() => {
    const generation = ++fileSearchGenerationRef.current;
    let active = true;
    setFileSuggestions([]);
    if (!fileMatch || !activeProjectId) return () => { active = false; };
    const query = fileMatch.query;
    const start = fileMatch.start;
    const isCurrent = () => {
      const current = useAppStore.getState();
      const currentDraft = current.acpDrafts[session.id] ?? EMPTY_DRAFT;
      const currentMatch = matchAcpFileToken(currentDraft.text, caretRef.current);
      return active
        && fileSearchGenerationRef.current === generation
        && current.activeProjectId === activeProjectId
        && current.acpSessions.some((candidate) => candidate.id === session.id && candidate.projectId === activeProjectId)
        && currentMatch?.query === query
        && currentMatch.start === start;
    };
    if (!query) {
      setFileSuggestions(filterAcpFiles(loadedWorkspaceFiles, query));
      return () => { active = false; };
    }
    const timer = window.setTimeout(() => {
      void searchFiles(query, token).then((results) => {
        if (isCurrent()) setFileSuggestions(filterAcpFiles(results, query));
      }).catch((error) => {
        if (isCurrent()) setNotice(error instanceof Error ? error.message : "Workspace file search failed", "error");
      });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeProjectId, caret, directories, draft.text, fileMatch?.query, fileMatch?.start, session.id, setNotice, token]);

  // history is the TRIGGER that re-evaluates follow/scroll state; the body
  // only reads the live DOM element.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dep triggers history follow re-evaluation
  useEffect(() => {
    const element = historyRef.current;
    if (!element) return;
    setHistoryFollowState((current) => {
      const transition = stateAfterAcpHistoryActivity(current);
      if (transition.shouldScroll) element.scrollTop = element.scrollHeight;
      historyFollowBySession.set(session.id, transition.state);
      return transition.state;
    });
  }, [history]);

  const recover = () => {
    const currentState = useAppStore.getState();
    if (currentState.activeProjectId !== session.projectId) {
      currentState.setNotice("The session's project is no longer active", "error");
      return;
    }
    void dispatchAcpRecovery({
      dispatch: async () => {
        const created = await createAcpSession(session.providerId, token, { title: freshAcpSessionTitle(session.title) });
        if (created.projectId !== session.projectId) throw new Error("Fresh ACP session belongs to a different project");
        return created;
      },
      addSession: (created) => useAppStore.getState().addAcpSession(created),
      focusSession: (sessionId) => useAppStore.getState().setFocusedSession(sessionId),
      notifyFailure: (error) => useAppStore.getState().setNotice(error instanceof Error ? error.message : "Could not start a fresh ACP session", "error"),
    });
  };
  const selectCommand = (commandIndex: number) => {
    if (!commandMatch) return;
    const suggestion: AcpCommandSuggestion | undefined = commandSuggestions[commandIndex];
    if (!suggestion) return;
    setCompletionDismissed(true);
    if (suggestion.kind === "client") {
      const currentSession = useAppStore.getState().acpSessions.find((candidate) => candidate.id === session.id) ?? session;
      if (currentSession.status === "failed" || currentSession.status === "exited" || currentSession.status === "disconnected" || currentSession.status === "non_resumable") {
        recover();
        return;
      }
      const store = useAppStore.getState();
      dispatchAcpRollover({
        activePrompt: currentSession.activePrompt,
        authRequired: currentSession.status === "auth_required",
        live: currentSession.status === "live",
        dispatch: () => rolloverAcpSession(session.id, token),
        clearDraft: () => store.clearAcpDraft(session.id),
        getCurrentDraft: () => useAppStore.getState().acpDrafts[session.id] ?? EMPTY_DRAFT,
        restoreDraft: (restored) => useAppStore.getState().setAcpDraft(session.id, restored),
        adoptSession: (updated) => useAppStore.getState().applyAcpRollover(updated),
        notifyFailure: (error) => useAppStore.getState().setNotice(error instanceof Error ? error.message : "Could not start a new context", "error"),
      });
      window.setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }
    const insertion = insertAcpCommand(draft.text, commandMatch, suggestion.command);
    updateAcpDraft(session.id, { text: insertion.text });
    setCurrentCaret(insertion.caret);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(insertion.caret, insertion.caret);
    }, 0);
  };
  const selectFile = async (fileIndex: number) => {
    const selected = fileSuggestions[fileIndex];
    const match = fileMatch;
    if (!selected || !match) return;
    const projectId = useAppStore.getState().activeProjectId;
    if (!projectId || projectId !== session.projectId) return;
    const operation = ++fileSelectionGenerationRef.current;
    pendingFileReadsRef.current.add(operation);
    setFileReadPending(true);
    const position = match.end;
    const before = useAppStore.getState().acpDrafts[session.id] ?? EMPTY_DRAFT;
    const draftSnapshot: AcpPromptDraft = { text: before.text, references: [...before.references] };
    const isCurrentSelection = () => {
      const current = useAppStore.getState();
      return operation === fileSelectionGenerationRef.current
        && current.activeProjectId === projectId
        && current.acpSessions.find((candidate) => candidate.id === session.id)?.projectId === projectId;
    };
    try {
      const result = await readFile(selected.path, token);
      if (result.binary) throw new Error("Binary files cannot be attached to an ACP draft");
      const current = useAppStore.getState();
      const currentDraft = current.acpDrafts[session.id] ?? EMPTY_DRAFT;
      const currentCaret = textareaRef.current?.selectionStart ?? caretRef.current;
      const currentMatch = matchAcpFileToken(currentDraft.text, currentCaret);
      if (!isCurrentSelection() || !sameDraft(currentDraft, draftSnapshot) || currentCaret !== position || !currentMatch || currentMatch.start !== match.start || currentMatch.end !== position) return;
      const insertion = insertAcpFile(currentDraft.text, match, selected);
      const reference = captureMentionedFileReference({ path: selected.path, content: result.content, language: language(selected.path), mention: insertion.mention, mentionStart: match.start, mentionBefore: insertion.text.slice(0, match.start), mentionAfter: insertion.text.slice(insertion.caret) });
      const existing = currentDraft.references.find((candidate) => candidate.wholeFile && candidate.path === selected.path);
      const references = existing ? currentDraft.references.map((candidate) => candidate.id === existing.id ? { ...reference, id: existing.id } : candidate) : [...currentDraft.references, reference];
      updateAcpDraft(session.id, { text: insertion.text, references });
      setCurrentCaret(insertion.caret);
      setCompletionDismissed(true);
      setFileSuggestions([]);
      window.setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(insertion.caret, insertion.caret);
      }, 0);
    } catch (error) {
      if (isCurrentSelection()) setNotice(error instanceof Error ? error.message : "File could not be attached", "error");
    } finally {
      pendingFileReadsRef.current.delete(operation);
      if (pendingFileReadsRef.current.size === 0) setFileReadPending(false);
    }
  };
  const removeDraftReference = (referenceId: string) => {
    const current = useAppStore.getState().acpDrafts[session.id] ?? EMPTY_DRAFT;
    const reference = current.references.find((candidate) => candidate.id === referenceId);
    if (!reference) return;
    const text = removeGeneratedReferenceMention(current.text, reference);
    updateAcpDraft(session.id, { text, references: current.references.filter((candidate) => candidate.id !== referenceId) });
    setCurrentCaret(Math.min(caretRef.current, text.length));
  };
  const onHistoryScroll = () => {
    const element = historyRef.current;
    if (!element) return;
    setHistoryFollowState((current) => {
      const next = stateAfterAcpHistoryScroll({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }, current);
      historyFollowBySession.set(session.id, next);
      return next;
    });
  };
  const resumeHistory = () => {
    const element = historyRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    const next = resumedAcpHistoryFollowState();
    historyFollowBySession.set(session.id, next);
    setHistoryFollowState(next);
  };
  const queueFollowUp = () => {
    const next = enqueueAcpPrompt(queuedPrompts, draft);
    if (next.length === queuedPrompts.length) return;
    setQueuedPrompts(next);
    useAppStore.getState().clearAcpDraft(session.id);
  };
  const sendQueued = async (item: AcpQueuedPrompt) => {
    const current = useAppStore.getState().acpSessions.find((candidate) => candidate.id === session.id) ?? session;
    if (!canDispatchAcpPrompt(acpComposerState({ activePrompt: current.activePrompt, status: current.status, pendingRequest: current.pendingRequests.length > 0 }))) return;
    setQueuedPrompts((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, state: "dispatching" } : candidate));
    try {
      await promptAcpSession(session.id, item.request, token);
      setQueuedPrompts((items) => removeQueuedAcpPrompt(items, item.id));
    } catch (error) {
      setQueuedPrompts((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, state: "queued" } : candidate));
      setNotice(error instanceof Error ? error.message : "Queued ACP prompt failed", "error");
    }
  };
  const submit = () => {
    if (pendingFileReadsRef.current.size > 0) return false;
    const currentState = useAppStore.getState();
    const currentSession = currentState.acpSessions.find((candidate) => candidate.id === session.id) ?? session;
    return dispatchAcpPrompt({
      draft: currentState.acpDrafts[session.id] ?? EMPTY_DRAFT,
      activePrompt: currentSession.activePrompt,
      authRequired: currentSession.status === "auth_required",
      dispatch: (request) => promptAcpSession(session.id, request, token),
      clear: () => clearAcpDraft(session.id),
      getCurrentDraft: () => useAppStore.getState().acpDrafts[session.id] ?? EMPTY_DRAFT,
      restore: (submittedDraft) => setAcpDraft(session.id, submittedDraft),
      notifyFailure: (error) => setNotice(error instanceof Error ? error.message : "ACP prompt failed", "error"),
    });
  };
  const cancel = async () => {
    try { await cancelAcpSession(session.id, token); }
    catch (error) { setNotice(error instanceof Error ? error.message : "ACP cancellation failed", "error"); }
  };
  const status = session.status as string;
  const state = status === "auth_required" ? "auth_required" : status === "connecting" ? "connecting" : status === "stopping" ? "stopping" : status === "disconnected" ? "disconnected" : status === "failed" ? "failed" : status === "exited" || status === "non_resumable" ? "exited" : session.pendingRequests.length ? "waiting" : session.activePrompt ? "active" : "ready";
  const recoveryMessage = state === "exited" ? "This session has exited. Its conversation remains available." : state === "failed" ? "The provider connection failed. Retained activity is still available." : state === "disconnected" ? "The provider connection was lost. Retained activity is still available." : state === "auth_required" ? "Authenticate this session before sending a prompt." : state === "waiting" ? "A provider decision is pending for this session." : state === "active" ? "The provider is working on this session." : state === "connecting" ? "Connecting to the provider; this session remains local to the selected project." : state === "stopping" ? "Stopping this session; wait for confirmed exit." : undefined;
  const canStartFreshSession = state === "failed" || state === "exited" || state === "disconnected";
  return <div className="acp-conversation">
    <header className="acp-execution-header"><div><span className="eyebrow">ACP SESSION · {session.providerLabel}</span><strong>{session.title}</strong><small>{session.resumability.replaceAll("_", " ")} · session-local conversation</small></div><SessionStatus entry={{ kind: "acp", session }} /></header>
    {recoveryMessage && <div className={`acp-recovery acp-state-${state}`} role={state === "failed" || state === "exited" || state === "disconnected" ? "alert" : "status"}><strong>{state === "waiting" ? "Decision required" : state === "auth_required" ? "Authentication required" : state === "active" ? "Working" : state === "connecting" ? "Connecting" : state === "stopping" ? "Stopping" : state === "disconnected" ? "Disconnected" : state === "exited" ? "Session exited" : state === "failed" ? "Provider connection failed" : "Ready"}</strong><span>{recoveryMessage}{session.error ? ` ${session.error}` : ""}</span>{canStartFreshSession && <button type="button" onClick={recover}>Start a fresh session</button>}</div>}
    <SubagentList subagents={session.subagents} />
    <ConfigControls session={session} />
    <AuthPanel session={session} />
    {session.pendingRequests.map((request) => <PendingRequest key={request.request.requestId} session={session} request={request} />)}
    <div className="acp-history-wrap" aria-busy={fileReadPending}>
    <section ref={historyRef} className="acp-history" onScroll={onHistoryScroll} aria-label={`${session.title} conversation`} aria-live="off"><AcpTurnNarrative history={history} pendingRequests={session.pendingRequests} onOpenReference={(path, line, column, target) => onOpenReference(path, line, column, { projectId: session.projectId, sessionId: session.id, ...(target?.turnId ? { turnId: target.turnId } : {}), ...(target?.activityId ? { activityId: target.activityId } : {}) })} onOpenDiff={onOpenDiff ? (path, target) => onOpenDiff(path, { projectId: session.projectId, sessionId: session.id, ...(target?.turnId ? { turnId: target.turnId } : {}), ...(target?.activityId ? { activityId: target.activityId } : {}) }) : undefined} /></section>{historyFollowState.hasNewActivity && <button type="button" className="acp-new-activity" onClick={resumeHistory}>New activity</button>}</div>
     <div className="acp-composer"><div className="acp-composer-input"><textarea ref={textareaRef} value={draft.text} onChange={(event) => { updateAcpDraft(session.id, { text: event.target.value }); setCurrentCaret(event.currentTarget.selectionStart); setCompletionDismissed(false); }} onSelect={(event) => { setCurrentCaret(event.currentTarget.selectionStart); setCompletionDismissed(false); }} placeholder={state === "active" ? "Draft a follow-up while this session works" : "Prompt this ACP session..."} role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls={completionOpen ? completionListId : undefined} aria-activedescendant={completionOpen ? `${completionListId}-${activeCompletionIndex}` : undefined} aria-expanded={completionOpen} onKeyDown={(event) => {
        const action = acpComposerKeyAction({ key: event.key, completionOpen, isComposing: event.nativeEvent.isComposing, shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey });
        if (action === "move-down") { event.preventDefault(); setActiveCompletionIndex((current) => fileMatch ? moveAcpFileIndex(current, 1, fileSuggestions.length) : moveAcpCommandIndex(current, 1, commandSuggestions.length)); return; }
        if (action === "move-up") { event.preventDefault(); setActiveCompletionIndex((current) => fileMatch ? moveAcpFileIndex(current, -1, fileSuggestions.length) : moveAcpCommandIndex(current, -1, commandSuggestions.length)); return; }
        if (action === "select-command") { event.preventDefault(); if (fileMatch) void selectFile(activeCompletionIndex); else selectCommand(activeCompletionIndex); return; }
        if (action === "dismiss-completion") { event.preventDefault(); fileSelectionGenerationRef.current += 1; setCompletionDismissed(true); return; }
        if (action === "submit") { if (pendingFileReadsRef.current.size > 0) event.preventDefault(); else if (submit()) event.preventDefault(); }
      }} />{completionOpen && fileMatch ? <div id={fileListId} className="acp-command-suggestions acp-file-suggestions" role="listbox" aria-label="Workspace files">{fileSuggestions.map((file, index) => <button id={`${fileListId}-${index}`} type="button" role="option" aria-selected={index === activeCompletionIndex} className={index === activeCompletionIndex ? "active" : ""} key={file.path} onMouseDown={(event) => event.preventDefault()} onClick={() => void selectFile(index)}><span><strong>@{file.path}</strong><small>Disk file</small></span></button>)}</div> : completionOpen ? <div id={commandListId} className="acp-command-suggestions" role="listbox" aria-label="Session commands">{commandSuggestions.map((suggestion, index) => suggestion.kind === "client" ? <button id={`${commandListId}-${index}`} type="button" role="option" aria-selected={index === activeCompletionIndex} className={`acp-command-client ${index === activeCompletionIndex ? "active" : ""}`} key={`client-${suggestion.command.name}`} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCommand(index)}><span><strong>/{suggestion.command.name}</strong><small>{suggestion.command.description}</small></span><em>session</em></button> : <button id={`${commandListId}-${index}`} type="button" role="option" aria-selected={index === activeCompletionIndex} className={index === activeCompletionIndex ? "active" : ""} key={suggestion.command.name} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCommand(index)}><span><strong>/{suggestion.command.name}</strong>{suggestion.command.description && <small>{suggestion.command.description}</small>}</span>{suggestion.command.inputHint && <em>{suggestion.command.inputHint}</em>}</button>)}</div> : null}</div>      {/* Layout container naming an attachment group; a fieldset would change layout semantics */}
      {/* biome-ignore lint/a11y/useSemanticElements: grouped attachments, not a form field group */}
      {draft.references.length > 0 && <div className="acp-draft-attachments" role="group" aria-label="ACP draft attachments">{draft.references.map((reference) => <div className="acp-draft-attachment" key={reference.id}><span><strong>{reference.path}</strong><small>{reference.wholeFile ? "whole file" : `lines ${reference.startLine}-${reference.endLine}`} · {reference.content.length.toLocaleString()} chars{reference.mention ? " · disk snapshot" : ""}</small></span><button type="button" onClick={() => removeDraftReference(reference.id)} aria-label={`Remove ${reference.path} from draft`}>×</button></div>)}</div>}
      {queuedPrompts.length > 0 && <fieldset className="acp-queued-prompts" aria-label="Queued follow-up prompts"><legend className="acp-activity-label">Queued follow-ups · explicit send required</legend>{queuedPrompts.map((item, index) => <div className="acp-queued-prompt" key={item.id}><span>{item.snapshot.text || "Reference review"}</span><button type="button" onClick={() => setQueuedPrompts((items) => moveQueuedAcpPrompt(items, item.id, -1))} disabled={index === 0 || item.state === "dispatching"} aria-label={`Move queued prompt ${index + 1} up`}>↑</button><button type="button" onClick={() => setQueuedPrompts((items) => moveQueuedAcpPrompt(items, item.id, 1))} disabled={index === queuedPrompts.length - 1 || item.state === "dispatching"} aria-label={`Move queued prompt ${index + 1} down`}>↓</button><button type="button" onClick={() => setQueuedPrompts((items) => removeQueuedAcpPrompt(items, item.id))} disabled={item.state === "dispatching"}>Remove</button>{!session.activePrompt && <button type="button" onClick={() => void sendQueued(item)} disabled={item.state === "dispatching"}>{item.state === "dispatching" ? "Sending…" : "Send"}</button>}</div>)}</fieldset>}
      <div className="acp-composer-footer"><span>{state === "active" ? "Working · draft is unsent" : state === "waiting" ? "Waiting for an explicit decision" : draft.references.length ? `${draft.references.length} reference${draft.references.length === 1 ? "" : "s"} attached` : "@ files · / commands · Shift+Enter newline"}</span><div>{session.activePrompt ? <><button type="button" onClick={queueFollowUp} disabled={!draft.text.trim() && !draft.references.length}>Queue follow-up</button><button type="button" onClick={() => void cancel()}>Cancel turn</button></> : <button type="button" className="primary-button compact" onClick={() => void submit()} disabled={state !== "ready" || (!draft.text.trim() && !draft.references.length)}>{ACP_SEND_LABEL}</button>}</div></div></div>
   </div>;
}

export function AgentWorkbench({ onNewAgent, onOpenReference, onOpenDiff }: AgentWorkbenchProps) {
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
      <header className="agent-navigator-header"><div><span className="eyebrow">AGENT WORKBENCH</span><strong>{agents.length} {agents.length === 1 ? "agent" : "agents"}</strong></div><button type="button" className="primary-button compact" onClick={onNewAgent}>+ New agent</button></header>
      <div className="agent-navigator-body"><section className="session-group"><div className="session-group-heading"><span>AGENTS</span><b>{agents.length}</b></div>{agents.length === 0 ? <div className="session-empty">No agent sessions yet.<button type="button" onClick={onNewAgent}>Start an agent</button></div> : agents.map((entry) => <div className={`session-row ${entry.session.id === focused?.session.id ? "selected" : ""}`} key={`${entry.kind}-${entry.session.id}`}>
        <button type="button" className="session-select" onClick={() => focus(entry)} title={`Focus ${entry.session.title}`}><span className="session-title">{entry.session.title}</span><span className="session-provider">{entry.kind === "acp" ? entry.session.providerLabel : entry.session.command}</span><SessionStatus entry={entry} /></button>
        <div className="session-actions"><button type="button" onClick={() => { setFocusedSession(entry.session.id); setReferenceTarget(isLive(entry) ? entry.session.id : undefined); }} aria-label={`Target ${entry.session.title}`} title="Use as handoff target">◎</button><button type="button" onClick={() => setPinnedSession(pinned?.session.id === entry.session.id ? undefined : entry.session.id)} aria-label={`${pinned?.session.id === entry.session.id ? "Unpin" : "Pin"} ${entry.session.title}`} title={pinned?.session.id === entry.session.id ? "Unpin agent" : "Pin agent"}>{pinned?.session.id === entry.session.id ? "▣" : "□"}</button><button type="button" onClick={() => void rename(entry)} aria-label={`Rename ${entry.session.title}`} title="Rename agent">✎</button><button type="button" onClick={() => void close(entry)} aria-label={`Close ${entry.session.title}`} title="Close agent">×</button></div>
      </div>)}</section></div>
      <footer className="agent-target"><label htmlFor="agent-target">HANDOFF TARGET</label><select id="agent-target" value={referenceTargetId ?? ""} onChange={(event) => setReferenceTarget(event.target.value || undefined)}><option value="">No live agent selected</option>{liveAgents.map((entry) => <option value={entry.session.id} key={`${entry.kind}-${entry.session.id}`}>{entry.session.title}{entry.kind === "acp" ? ` · ${entry.session.providerLabel}` : ""}</option>)}</select><span>{referenceTargetId && liveAgents.some((entry) => entry.session.id === referenceTargetId) ? "Ready for reference insertion" : "Choose a live agent from here or Edit"}</span></footer>
    </aside>
    <div className="agent-stage">{visibleAgents.length ? <div className={`agent-terminal-grid ${visibleAgents.length > 1 ? "split" : ""}`}>{visibleAgents.map((entry) => <article className={`agent-terminal-card ${entry.kind === "acp" ? "acp-card" : ""}`} key={`${entry.kind}-${entry.session.id}`}><header><div><span className="eyebrow">{entry.session.id === focused?.session.id ? "FOCUSED SESSION" : "PINNED SESSION"}</span><strong>{entry.session.title}</strong></div><SessionStatus entry={entry} /></header>{entry.kind === "acp" ? <AcpConversation session={entry.session} onOpenReference={onOpenReference} onOpenDiff={onOpenDiff} /> : <TerminalView session={entry.session} onOpenReference={(path, line, column) => onOpenReference(path, line, column, { projectId: entry.session.projectId, sessionId: entry.session.id })} />}</article>)}</div> : <div className="agent-empty"><span className="agent-empty-mark">◎</span><p className="eyebrow">NO AGENTS RUNNING</p><h2>Start a parallel work window.</h2><p>Use named sessions for implementation, planning, or any other task you want to watch.</p><button type="button" className="primary-button" onClick={onNewAgent}>Start first agent</button></div>}</div>
  </section>;
}

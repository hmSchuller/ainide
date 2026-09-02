import { insertTerminalInput } from "../api";
import { appendReferenceItems, copyReference, copyReferenceKit, serializeReferenceKit } from "../references";
import { useAppStore } from "../store";

export function ReferenceDock() {
  const token = useAppStore((state) => state.token);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const terminals = useAppStore((state) => state.terminals);
  const acpSessions = useAppStore((state) => state.acpSessions);
  const updateAcpDraft = useAppStore((state) => state.updateAcpDraft);
  const kit = useAppStore((state) => state.referenceKit);
  const targetId = useAppStore((state) => state.referenceTargetId);
  const setTarget = useAppStore((state) => state.setReferenceTarget);
  const removeReference = useAppStore((state) => state.removeReference);
  const clearReferences = useAppStore((state) => state.clearReferences);
  const setNotice = useAppStore((state) => state.setNotice);
  const agents = terminals.filter((terminal) => terminal.projectId === activeProjectId && terminal.kind === "agent");
  const liveAgents = agents.filter((agent) => agent.alive);
  const acpAgents = acpSessions.filter((session) => session.projectId === activeProjectId);
  const liveAcpAgents = acpAgents.filter((session) => session.status === "live" || session.status === "waiting");
  const target = liveAgents.find((agent) => agent.id === targetId);
  const acpTarget = liveAcpAgents.find((session) => session.id === targetId);
  const copyKit = async () => {
    const result = await copyReferenceKit(kit);
    if (result.ok) setNotice("Reference kit copied", "success");
    else setNotice(result.error ?? "Could not copy reference kit", "error");
  };
  const pasteKit = async () => {
    if (!kit.length) { setNotice("Reference kit is empty", "info"); return; }
    if (!target && !acpTarget) { setNotice("No live agent is available for handoff; use Copy kit instead", "error"); return; }
    if (acpTarget) {
      const current = useAppStore.getState().acpDrafts[acpTarget.id] ?? { text: "", references: [] };
      updateAcpDraft(acpTarget.id, { references: appendReferenceItems(current.references, kit) });
      setNotice(`Added ${kit.length} reference${kit.length === 1 ? "" : "s"} to ${acpTarget.title}'s draft`, "success");
      return;
    }
    if (!target) return;
    try {
      await insertTerminalInput(token, target.id, serializeReferenceKit(kit));
      setNotice(`Reference kit inserted into ${target.title}`, "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Reference handoff failed; the kit is still available to copy", "error");
    }
  };
  const copyItem = async (id: string) => {
    const item = kit.find((reference) => reference.id === id);
    if (!item) return;
    const result = await copyReference(item);
    if (result.ok) setNotice(`${item.path} reference copied`, "success");
    else setNotice(result.error ?? "Could not copy reference", "error");
  };

  return <aside className="reference-dock" aria-label="Reference kit">
    <header><div><span className="eyebrow">REFERENCE KIT</span><strong>{kit.length} {kit.length === 1 ? "item" : "items"}</strong></div>{kit.length > 0 && <button type="button" onClick={clearReferences}>Clear</button>}</header>
    {kit.length === 0 ? <p className="reference-empty">Select code or use a file action to collect context here.</p> : <div className="reference-items">{kit.map((item) => <div className="reference-item" key={item.id}><div className="reference-item-copy"><strong>{item.path}</strong><span>{item.wholeFile ? "whole file" : `lines ${item.startLine}-${item.endLine}`}</span><small>{item.content.length.toLocaleString()} chars</small></div><div className="reference-item-actions"><button type="button" onClick={() => void copyItem(item.id)} title="Copy this reference">Copy</button><button type="button" onClick={() => removeReference(item.id)} title="Remove reference">×</button></div></div>)}</div>}
     <div className="reference-controls"><label htmlFor="dock-agent-target">Target agent</label><select id="dock-agent-target" value={targetId ?? ""} onChange={(event) => setTarget(event.target.value || undefined)}><option value="">No live agent</option>{liveAgents.map((agent) => <option value={agent.id} key={agent.id}>{agent.title}</option>)}{liveAcpAgents.map((session) => <option value={session.id} key={session.id}>{session.title} · {session.providerLabel}</option>)}</select><div className="reference-buttons"><button type="button" onClick={() => void copyKit()} disabled={!kit.length}>Copy kit</button><button type="button" className="primary-button" onClick={() => void pasteKit()} disabled={!kit.length}>Paste reference kit</button></div></div>
  </aside>;
}

import { useState } from "react";
import { anchorFromClientRect, type AnnotationAnchor } from "../annotation-anchor";
import { insertTerminalInput } from "../api";
import { appendReferenceItems, copyReference, copyReferenceKit, type ReferenceItem, serializeReferenceKit } from "../references";
import { useAppStore } from "../store";
import { ReferenceAnnotationDialog } from "./ReferenceAnnotationDialog";

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
  const updateReferenceComment = useAppStore((state) => state.updateReferenceComment);
  const clearReferences = useAppStore((state) => state.clearReferences);
  const setNotice = useAppStore((state) => state.setNotice);
  const [editingReference, setEditingReference] = useState<{ item: ReferenceItem; anchor: AnnotationAnchor } | null>(null);
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
    {kit.length === 0 ? <p className="reference-empty">Select code or use a file action to collect context here.</p> : <div className="reference-items">{kit.map((item) => {
      const scope = item.wholeFile ? "whole file" : `lines ${item.startLine}-${item.endLine}`;
      return <div className="reference-item" key={item.id}>
        <div className="reference-item-copy">
          <strong title={item.path}>{item.path}</strong>
          <span title={`${scope} · ${item.content.length.toLocaleString()} chars captured`}>{scope}</span>
          <button type="button" className={`reference-item-comment${item.comment ? "" : " empty"}`} aria-label={`Edit comment for ${item.path}`} title={item.comment ?? "Add a note for the agent"} onClick={(event) => setEditingReference({ item, anchor: anchorFromClientRect(event.currentTarget.getBoundingClientRect()) })}>{item.comment || "Add a note for the agent"}</button>
        </div>
        <div className="reference-item-actions"><button type="button" onClick={() => void copyItem(item.id)} title="Copy this reference">Copy</button><button type="button" onClick={() => removeReference(item.id)} title="Remove reference">×</button></div>
      </div>;
    })}</div>}
     <div className="reference-controls"><label htmlFor="dock-agent-target">Target agent</label><select id="dock-agent-target" value={targetId ?? ""} onChange={(event) => setTarget(event.target.value || undefined)}><option value="">No live agent</option>{liveAgents.map((agent) => <option value={agent.id} key={agent.id}>{agent.title}</option>)}{liveAcpAgents.map((session) => <option value={session.id} key={session.id}>{session.title} · {session.providerLabel}</option>)}</select><div className="reference-buttons"><button type="button" onClick={() => void copyKit()} disabled={!kit.length}>Copy kit</button><button type="button" className="primary-button" onClick={() => void pasteKit()} disabled={!kit.length}>Paste reference kit</button></div></div>
    {editingReference && <ReferenceAnnotationDialog key={editingReference.item.id} reference={editingReference.item} anchor={editingReference.anchor} initialComment={editingReference.item.comment ?? ""} eyebrow="EDIT NOTE" confirmLabel="Save" onConfirm={(comment) => { updateReferenceComment(editingReference.item.id, comment); setEditingReference(null); }} onCancel={() => setEditingReference(null)} />}
  </aside>;
}

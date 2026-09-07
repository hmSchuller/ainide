import type { AcpProviderDescriptor } from "@ainide/shared";
import { useRef, useState } from "react";
import { useDialogFocus } from "../accessibility";
import { describeRecentSessionRecency, recentSessionLabel } from "../acp-recent-sessions";
import type { AcpRecentSessionsState } from "../store";

interface AcpProviderPickerProps {
  providers: AcpProviderDescriptor[];
  disabled?: string[];
  loading: boolean;
  error?: string;
  startingProviderId?: string;
  recentSessions?: Record<string, AcpRecentSessionsState>;
  ptyAvailable?: boolean;
  initialExpandedProviders?: string[];
  onRetry: () => void;
  onSelect: (providerId: string) => void;
  onRecentSelect: (providerId: string, sessionId: string) => void;
  onSelectPty?: () => void;
  onClose: () => void;
}

function RecentSessions({ providerId, label, state, busy, expanded, onToggle, onRecentSelect }: { providerId: string; label: string; state?: AcpRecentSessionsState; busy: boolean; expanded: boolean; onToggle: () => void; onRecentSelect: AcpProviderPickerProps["onRecentSelect"] }) {
  if (!state) return <fieldset className="acp-recent-sessions" aria-label={`Recent ${label} sessions`}><small>Checking recent sessions...</small></fieldset>;
  if (state.status === "loading") return <fieldset className="acp-recent-sessions" aria-label={`Recent ${label} sessions`}><small role="status">Checking recent sessions...</small></fieldset>;
  if (state.status === "unavailable") return <fieldset className="acp-recent-sessions" aria-label={`Recent ${label} sessions`}><small>Resuming is unavailable for {label}</small></fieldset>;
  if (!state.sessions.length) return <fieldset className="acp-recent-sessions" aria-label={`Recent ${label} sessions`}><small>No resumable sessions in this workspace</small></fieldset>;
  const listId = `acp-recent-${providerId}`;
  return (
    <fieldset className="acp-recent-sessions" aria-label={`Recent ${label} sessions`}>
      <button type="button" className="acp-recent-toggle" aria-expanded={expanded} aria-controls={listId} disabled={busy} onClick={onToggle}><span>{expanded ? "▾" : "▸"} Recent sessions ({state.sessions.length})</span></button>
      {expanded && (
      <div className="acp-recent-list" id={listId}>
      {state.sessions.map((summary) => {
        const recency = describeRecentSessionRecency(summary.updatedAt);
        return (
          <button type="button" className="acp-recent-session" key={summary.sessionId} disabled={busy} onClick={() => onRecentSelect(providerId, summary.sessionId)}>
            <span><strong>{recentSessionLabel(summary)}</strong>{recency && <small>{recency}</small>}</span>
            <span className="acp-provider-arrow">↺</span>
          </button>
        );
      })}
      </div>
      )}
    </fieldset>
  );
}

export function AcpProviderPicker({ providers, disabled = [], loading, error, startingProviderId, recentSessions, ptyAvailable = true, initialExpandedProviders, onRetry, onSelect, onRecentSelect, onSelectPty, onClose }: AcpProviderPickerProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, "[data-dialog-initial-focus]", startingProviderId ? undefined : onClose);

  const disabledIds = new Set(disabled);
  const enabled = providers.filter((provider) => !disabledIds.has(provider.id));
  // Per-provider expand state, collapsed by default. The picker unmounts on
  // close, so reopening naturally resets every provider to collapsed.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries((initialExpandedProviders ?? []).map((id) => [id, true])));
  const toggleExpanded = (providerId: string) => setExpanded((current) => ({ ...current, [providerId]: !current[providerId] }));

  // Provider-picker overlay double-clicks dismiss the modal; dialog owns Escape/close
  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss; the picker itself owns close/Escape */
    <div className="overlay acp-picker-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !startingProviderId) onClose(); }}>
    <section ref={dialogRef} className="acp-provider-picker" role="dialog" aria-modal="true" aria-labelledby="acp-provider-picker-title" tabIndex={-1}>
      <header className="acp-provider-picker-header">
        <div><span className="eyebrow">AGENT SESSIONS</span><h2 id="acp-provider-picker-title">Start a session</h2></div>
        <button type="button" className="acp-picker-close" data-dialog-initial-focus onClick={onClose} disabled={Boolean(startingProviderId)} aria-label="Close provider picker">×</button>
      </header>
      <p className="acp-provider-picker-copy">Choose an ACP provider or start a PTY session. Sessions start immediately and can be renamed for their purpose.</p>
      {loading && <div className="acp-picker-state" role="status">Loading configured providers...</div>}
      {!loading && error && <div className="acp-picker-state error-box" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></div>}
      {!loading && !error && !providers.length && <div className="acp-picker-state" role="status"><strong>No ACP providers configured</strong><span>Add an entry to <code>acpAgents</code> in the local ainide configuration, then retry.</span><button type="button" onClick={onRetry}>Check again</button></div>}
      {!loading && !error && providers.length > 0 && !enabled.length && <div className="acp-picker-state" role="status"><strong>No ACP providers available for this project</strong><span>Every configured provider is disabled here. Re-enable one from Project settings.</span><button type="button" onClick={onRetry}>Check again</button></div>}
      {/* Layout container naming a control group; a fieldset would change layout semantics */}
      {/* biome-ignore lint/a11y/useSemanticElements: grouped action list, not a form field group */}
      {!loading && !error && enabled.length > 0 && <div className="acp-provider-list" role="group" aria-label="Configured ACP providers">{enabled.map((provider) => (
        <div className="acp-provider-group" key={provider.id}>
          <button type="button" className={`acp-provider-option ${startingProviderId === provider.id ? "starting" : ""}`} disabled={Boolean(startingProviderId)} onClick={() => onSelect(provider.id)}><span className="acp-provider-glyph">◎</span><span><strong>{provider.label}</strong><small>{startingProviderId === provider.id ? "Starting session..." : "Start a new session"}</small></span><span className="acp-provider-arrow">→</span></button>
          <RecentSessions providerId={provider.id} label={provider.label} state={recentSessions?.[provider.id]} busy={Boolean(startingProviderId)} expanded={Boolean(expanded[provider.id])} onToggle={() => toggleExpanded(provider.id)} onRecentSelect={onRecentSelect} />
        </div>
      ))}</div>}
      {!loading && !error && ptyAvailable && <button type="button" className={`acp-provider-option acp-pty-option ${startingProviderId === "pty" ? "starting" : ""}`} disabled={Boolean(startingProviderId)} onClick={onSelectPty}><span className="acp-provider-glyph">⌁</span><span><strong>PTY agent session</strong><small>{startingProviderId === "pty" ? "Starting session..." : "Start a real terminal session"}</small></span><span className="acp-provider-arrow">→</span></button>}
      {!loading && !error && <button type="button" className="acp-picker-cancel" onClick={onClose} disabled={Boolean(startingProviderId)}>Cancel</button>}
    </section>
    </div>
  );
}

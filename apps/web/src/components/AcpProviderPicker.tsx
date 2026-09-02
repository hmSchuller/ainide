import type { AcpProviderDescriptor } from "@ainide/shared";
import { useEffect } from "react";

interface AcpProviderPickerProps {
  providers: AcpProviderDescriptor[];
  disabled?: string[];
  loading: boolean;
  error?: string;
  startingProviderId?: string;
  onRetry: () => void;
  onSelect: (providerId: string) => void;
  onClose: () => void;
}

export function AcpProviderPicker({ providers, disabled = [], loading, error, startingProviderId, onRetry, onSelect, onClose }: AcpProviderPickerProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !startingProviderId) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, startingProviderId]);

  const disabledIds = new Set(disabled);
  const enabled = providers.filter((provider) => !disabledIds.has(provider.id));

  // Provider-picker overlay double-clicks dismiss the modal; dialog owns Escape/close
  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss; the picker itself owns close/Escape */
    <div className="overlay acp-picker-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !startingProviderId) onClose(); }}>
    <section className="acp-provider-picker" role="dialog" aria-modal="true" aria-labelledby="acp-provider-picker-title">
      <header className="acp-provider-picker-header">
        <div><span className="eyebrow">ACP PROVIDERS</span><h2 id="acp-provider-picker-title">Start an agent</h2></div>
        <button type="button" className="acp-picker-close" onClick={onClose} disabled={Boolean(startingProviderId)} aria-label="Close provider picker">×</button>
      </header>
      <p className="acp-provider-picker-copy">Choose a configured provider. The session starts immediately and its title can arrive from the provider.</p>
      {loading && <div className="acp-picker-state" role="status">Loading configured providers...</div>}
      {!loading && error && <div className="acp-picker-state error-box" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></div>}
      {!loading && !error && !providers.length && <div className="acp-picker-state" role="status"><strong>No ACP providers configured</strong><span>Add an entry to <code>acpAgents</code> in the local ainide configuration, then retry.</span><button type="button" onClick={onRetry}>Check again</button></div>}
      {!loading && !error && providers.length > 0 && !enabled.length && <div className="acp-picker-state" role="status"><strong>No ACP providers available for this project</strong><span>Every configured provider is disabled here. Re-enable one from Project settings.</span><button type="button" onClick={onRetry}>Check again</button></div>}
      {/* Layout container naming a control group; a fieldset would change layout semantics */}
      {/* biome-ignore lint/a11y/useSemanticElements: grouped action list, not a form field group */}
      {!loading && !error && enabled.length > 0 && <div className="acp-provider-list" role="group" aria-label="Configured ACP providers">{enabled.map((provider) => <button type="button" className={`acp-provider-option ${startingProviderId === provider.id ? "starting" : ""}`} key={provider.id} disabled={Boolean(startingProviderId)} onClick={() => onSelect(provider.id)}><span className="acp-provider-glyph">◎</span><span><strong>{provider.label}</strong><small>{startingProviderId === provider.id ? "Starting session..." : "Start a new session"}</small></span><span className="acp-provider-arrow">→</span></button>)}</div>}
      {!loading && !error && <button type="button" className="acp-picker-cancel" onClick={onClose} disabled={Boolean(startingProviderId)}>Cancel</button>}
    </section>
    </div>
  );
}

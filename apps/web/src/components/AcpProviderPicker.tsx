import { useEffect } from "react";
import type { AcpProviderDescriptor } from "@ainide/shared";

interface AcpProviderPickerProps {
  providers: AcpProviderDescriptor[];
  loading: boolean;
  error?: string;
  startingProviderId?: string;
  onRetry: () => void;
  onSelect: (providerId: string) => void;
  onClose: () => void;
}

export function AcpProviderPicker({ providers, loading, error, startingProviderId, onRetry, onSelect, onClose }: AcpProviderPickerProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !startingProviderId) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, startingProviderId]);

  return <div className="overlay acp-picker-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !startingProviderId) onClose(); }}>
    <section className="acp-provider-picker" role="dialog" aria-modal="true" aria-labelledby="acp-provider-picker-title">
      <header className="acp-provider-picker-header">
        <div><span className="eyebrow">ACP PROVIDERS</span><h2 id="acp-provider-picker-title">Start an agent</h2></div>
        <button type="button" className="acp-picker-close" onClick={onClose} disabled={Boolean(startingProviderId)} aria-label="Close provider picker">×</button>
      </header>
      <p className="acp-provider-picker-copy">Choose a configured provider. The session starts immediately and its title can arrive from the provider.</p>
      {loading && <div className="acp-picker-state" role="status">Loading configured providers...</div>}
      {!loading && error && <div className="acp-picker-state error-box" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></div>}
      {!loading && !error && !providers.length && <div className="acp-picker-state" role="status"><strong>No ACP providers configured</strong><span>Add an entry to <code>acpAgents</code> in the local ainide configuration, then retry.</span><button type="button" onClick={onRetry}>Check again</button></div>}
      {!loading && !error && providers.length > 0 && <div className="acp-provider-list" aria-label="Configured ACP providers">{providers.map((provider) => <button type="button" className={`acp-provider-option ${startingProviderId === provider.id ? "starting" : ""}`} key={provider.id} disabled={Boolean(startingProviderId)} onClick={() => onSelect(provider.id)}><span className="acp-provider-glyph">◎</span><span><strong>{provider.label}</strong><small>{startingProviderId === provider.id ? "Starting session..." : "Start a new session"}</small></span><span className="acp-provider-arrow">→</span></button>)}</div>}
      {!loading && !error && <button type="button" className="acp-picker-cancel" onClick={onClose} disabled={Boolean(startingProviderId)}>Cancel</button>}
    </section>
  </div>;
}

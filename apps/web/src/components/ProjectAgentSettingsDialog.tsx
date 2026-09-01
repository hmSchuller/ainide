import type { ProjectAgentSettings } from "@ainide/shared";

interface ProjectAgentSettingsDialogProps {
  settings: ProjectAgentSettings | null;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onToggle: (providerId: string, disabled: boolean) => void;
  onClose: () => void;
}

export function ProjectAgentSettingsDialog({ settings, loading, error, onRetry, onToggle, onClose }: ProjectAgentSettingsDialogProps) {
  const disabledIds = new Set(settings?.disabled ?? []);
  return <div className="overlay acp-picker-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="acp-provider-picker project-agent-settings" role="dialog" aria-modal="true" aria-labelledby="project-agent-settings-title">
      <header className="acp-provider-picker-header">
        <div><span className="eyebrow">PROJECT SETTINGS</span><h2 id="project-agent-settings-title">Agents for this project</h2></div>
        <button type="button" className="acp-picker-close" onClick={onClose} aria-label="Close project settings">×</button>
      </header>
      <p className="acp-provider-picker-copy">Choose which configured agents are available in this project. Disabled agents are hidden from the start-an-agent picker.</p>
      {loading && <div className="acp-picker-state" role="status">Loading agent settings...</div>}
      {!loading && error && <div className="acp-picker-state error-box" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></div>}
      {!loading && !error && settings && !settings.all.length && <div className="acp-picker-state" role="status"><strong>No ACP providers configured</strong><span>Add an entry to <code>acpAgents</code> in the local ainide configuration.</span></div>}
      {!loading && !error && settings && settings.all.length > 0 && <div className="acp-provider-list" aria-label="Configured ACP agents">{settings.all.map((provider) => {
        const isDisabled = disabledIds.has(provider.id);
        return <button type="button" key={provider.id} className={`acp-provider-option agent-settings-option ${isDisabled ? "disabled" : ""}`} onClick={() => onToggle(provider.id, !isDisabled)} aria-pressed={!isDisabled}>
          <span className="acp-provider-glyph">{isDisabled ? "○" : "◎"}</span>
          <span><strong>{provider.label}</strong><small>{isDisabled ? "Disabled for this project" : "Available in this project"}</small></span>
          <span className="agent-settings-toggle" aria-hidden="true">{isDisabled ? "Off" : "On"}</span>
        </button>;
      })}</div>}
      {!loading && !error && <button type="button" className="acp-picker-cancel" onClick={onClose}>Done</button>}
    </section>
  </div>;
}

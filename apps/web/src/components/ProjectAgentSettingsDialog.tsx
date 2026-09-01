import { useState } from "react";
import type { BuildCommand, ProjectAgentSettings } from "@ainide/shared";

interface ProjectAgentSettingsDialogProps {
  settings: ProjectAgentSettings | null;
  builds: BuildCommand[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onToggle: (providerId: string, disabled: boolean) => void;
  onSaveBuilds: (commands: BuildCommand[]) => Promise<void>;
  onClose: () => void;
}

export interface BuildRow {
  label: string;
  command: string;
}

export const MAX_BUILD_ROWS = 20;
export const MAX_BUILD_LABEL_LENGTH = 80;
export const MAX_BUILD_COMMAND_LENGTH = 500;

export function emptyBuildRow(): BuildRow {
  return { label: "", command: "" };
}

export function addBuildRow(rows: BuildRow[]): BuildRow[] {
  return [...rows, emptyBuildRow()];
}

export function updateBuildRow(rows: BuildRow[], index: number, patch: Partial<BuildRow>): BuildRow[] {
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
}

export function removeBuildRow(rows: BuildRow[], index: number): BuildRow[] {
  return rows.filter((_, i) => i !== index);
}

export function validateBuildRows(rows: BuildRow[]): string | undefined {
  if (rows.length > MAX_BUILD_ROWS) return `At most ${MAX_BUILD_ROWS} build commands are allowed`;
  if (rows.length === 0) return "Add at least one build command before saving";
  for (const row of rows) {
    if (!row.label.trim()) return "Every build command needs a label";
    if (!row.command.trim()) return "Every build command needs a command";
    if (row.label.trim().length > MAX_BUILD_LABEL_LENGTH) return `Labels must be at most ${MAX_BUILD_LABEL_LENGTH} characters`;
    if (row.command.trim().length > MAX_BUILD_COMMAND_LENGTH) return `Commands must be at most ${MAX_BUILD_COMMAND_LENGTH} characters`;
  }
  return undefined;
}

export function trimBuildRows(rows: BuildRow[]): BuildCommand[] {
  return rows.map((row) => ({ label: row.label.trim(), command: row.command.trim() }));
}

export function ProjectAgentSettingsDialog({ settings, builds, loading, error, onRetry, onToggle, onSaveBuilds, onClose }: ProjectAgentSettingsDialogProps) {
  const [rows, setRows] = useState<BuildRow[]>(builds.length ? builds.map((command) => ({ ...command })) : [emptyBuildRow()]);
  const [buildsSaving, setBuildsSaving] = useState(false);
  const [buildsError, setBuildsError] = useState<string>();
  const disabledIds = new Set(settings?.disabled ?? []);

  const save = async () => {
    const invalid = validateBuildRows(rows);
    if (invalid) {
      setBuildsError(invalid);
      return;
    }
    setBuildsError(undefined);
    setBuildsSaving(true);
    try {
      await onSaveBuilds(trimBuildRows(rows));
      onClose();
    } catch (error) {
      setBuildsError(error instanceof Error ? error.message : "Could not save build commands");
    } finally {
      setBuildsSaving(false);
    }
  };

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
      {!loading && !error && <section className="build-settings-section" aria-label="Build commands">
        <h3 className="build-settings-title">Build commands</h3>
        <p className="build-settings-copy">Runs in this project's root when you press play in the top bar. At most {MAX_BUILD_ROWS} commands, labels up to {MAX_BUILD_LABEL_LENGTH} and commands up to {MAX_BUILD_COMMAND_LENGTH} characters.</p>
        {rows.map((row, index) => <div className="build-settings-row" key={index}>
          <input className="build-settings-label" value={row.label} placeholder="Label" aria-label={`Build command ${index + 1} label`} onChange={(event) => setRows(updateBuildRow(rows, index, { label: event.target.value }))} />
          <input className="build-settings-command" value={row.command} placeholder="Command" aria-label={`Build command ${index + 1} command`} onChange={(event) => setRows(updateBuildRow(rows, index, { command: event.target.value }))} />
          <button type="button" className="build-settings-remove" aria-label={`Remove build command ${index + 1}`} onClick={() => setRows(removeBuildRow(rows, index))}>×</button>
        </div>)}
        <div className="build-settings-actions">
          <button type="button" className="build-settings-add" onClick={() => setRows(addBuildRow(rows))}>+ Add command</button>
          {buildsError && <div className="build-settings-error" role="alert">{buildsError}</div>}
        </div>
      </section>}
      {!loading && !error && <button type="button" className="acp-picker-cancel" onClick={() => void save()} disabled={buildsSaving}>{buildsSaving ? "Saving..." : "Done"}</button>}
    </section>
  </div>;
}
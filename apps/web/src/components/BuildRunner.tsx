import { useState } from "react";
import type { BuildCommand, TerminalSession } from "@ainide/shared";
import { closeTerminal, createTerminal } from "../api";
import { resolveBuildSelection } from "../build-selections";
import { useAppStore } from "../store";

interface BuildRunnerProps {
  onOpenSettings: () => void;
}

export function findLiveBuild(terminals: TerminalSession[], projectId?: string): TerminalSession | undefined {
  return projectId ? terminals.find((terminal) => terminal.projectId === projectId && terminal.kind === "build" && terminal.alive) : undefined;
}

export function resolveSelectedBuild(commands: BuildCommand[], remembered: string | undefined): BuildCommand | undefined {
  const label = resolveBuildSelection(commands, remembered);
  return commands.find((command) => command.label === label) ?? commands[0];
}

export function BuildRunner({ onOpenSettings }: BuildRunnerProps) {
  const token = useAppStore((state) => state.token);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const buildCommands = useAppStore((state) => state.buildCommands);
  const buildSelections = useAppStore((state) => state.buildSelections);
  const terminals = useAppStore((state) => state.terminals);
  const addTerminal = useAppStore((state) => state.addTerminal);
  const setActiveTerminal = useAppStore((state) => state.setActiveTerminal);
  const setTerminalCollapsed = useAppStore((state) => state.setTerminalCollapsed);
  const setBuildSelection = useAppStore((state) => state.setBuildSelection);
  const setNotice = useAppStore((state) => state.setNotice);
  const [busy, setBusy] = useState(false);

  const liveBuild = findLiveBuild(terminals, activeProjectId);
  const empty = buildCommands.length === 0;
  const selected = resolveSelectedBuild(buildCommands, activeProjectId ? buildSelections[activeProjectId] : undefined);

  const runOrStop = async () => {
    if (!token || !activeProjectId || busy) return;
    if (liveBuild) {
      try {
        await closeTerminal(liveBuild.id, token);
      } catch {
        // The process may already have exited; the session stays as an exited tab.
      }
      return;
    }
    if (!selected) return;
    setBusy(true);
    try {
      const created = await createTerminal("build", token, selected.label, selected.command);
      setTerminalCollapsed(false);
      addTerminal(created);
      setActiveTerminal(created.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Build could not be started", "error");
    } finally {
      setBusy(false);
    }
  };

  return <div className="build-runner">
    {empty && <button type="button" className="build-runner-hint" onClick={onOpenSettings} title="No build commands — define them in project settings">No build commands <span>Settings</span></button>}
    <select
      className="build-runner-select"
      aria-label="Build command"
      disabled={empty}
      value={selected?.label ?? ""}
      onChange={(event) => { if (activeProjectId) setBuildSelection(activeProjectId, event.target.value); }}
    >
      {buildCommands.map((command) => <option key={command.label} value={command.label}>{command.label}</option>)}
    </select>
    <button
      type="button"
      className="build-runner-button"
      onClick={() => void runOrStop()}
      disabled={empty || busy || (!liveBuild && !selected)}
      title={liveBuild ? "Stop the running build" : selected ? `Run ${selected.label}` : "Run build"}
    >
      {liveBuild ? "⏹" : "▶"}
    </button>
  </div>;
}
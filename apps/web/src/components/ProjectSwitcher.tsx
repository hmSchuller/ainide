import type { ProjectRef } from "@ainide/shared";
import { useState } from "react";

interface ProjectSwitcherProps {
  activeName: string;
  openProjects: ProjectRef[];
  activeProjectId?: string;
  onSwitch: (projectId: string) => void;
  onOpenAnother: () => void;
  onProjectSettings: () => void;
  onClose: () => void;
}

export function ProjectSwitcher({ activeName, openProjects, activeProjectId, onSwitch, onOpenAnother, onProjectSettings, onClose }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="project-switcher">
      <span className="top-brand">ainide</span>
      <button type="button" className="project-switcher-toggle" onClick={() => setOpen(!open)} title="Switch project">
        <b>{activeName}</b>
        <span>▾</span>
      </button>
      {open && (
        /* Menu root stops bubbling so global pointerdown dismissers ignore in-menu clicks */
        /* biome-ignore lint/a11y/noStaticElementInteractions: event-routing guard, not an interaction affordance */
        <div className="project-menu" onMouseDown={(event) => event.stopPropagation()}>
          {openProjects.map((project) => (
            <button type="button"
              key={project.projectId}
              className={project.projectId === activeProjectId ? "active" : ""}
              onClick={() => { setOpen(false); if (project.projectId !== activeProjectId) onSwitch(project.projectId); }}
            >
              {project.name}
              <small>{project.rootPath}</small>
            </button>
          ))}
          <button type="button" onClick={() => { setOpen(false); onOpenAnother(); }}>Open another…</button>
          <button type="button" onClick={() => { setOpen(false); onProjectSettings(); }}>Project settings…</button>
          <button type="button" onClick={() => { setOpen(false); onClose(); }}>Close project</button>
        </div>
      )}
      {open && <button type="button" className="project-menu-dismiss" aria-label="Close project menu" onClick={() => setOpen(false)} />}
    </div>
  );
}

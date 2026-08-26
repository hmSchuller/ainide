import { useEffect, useState } from "react";
import type { ProjectRef } from "@ainide/shared";

interface ProjectSwitcherProps {
  activeName: string;
  openProjects: ProjectRef[];
  activeProjectId?: string;
  onSwitch: (projectId: string) => void;
  onOpenAnother: () => void;
  onClose: () => void;
}

export function ProjectSwitcher({ activeName, openProjects, activeProjectId, onSwitch, onOpenAnother, onClose }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="project-switcher">
      <span className="top-brand">ainide</span>
      <button className="project-switcher-toggle" onClick={() => setOpen(!open)} title="Switch project">
        <b>{activeName}</b>
        <span>▾</span>
      </button>
      {open && (
        <div className="project-menu" onMouseDown={(event) => event.stopPropagation()}>
          {openProjects.map((project) => (
            <button
              key={project.projectId}
              className={project.projectId === activeProjectId ? "active" : ""}
              onClick={() => { setOpen(false); if (project.projectId !== activeProjectId) onSwitch(project.projectId); }}
            >
              {project.name}
              <small>{project.rootPath}</small>
            </button>
          ))}
          <button onClick={() => { setOpen(false); onOpenAnother(); }}>Open another…</button>
          <button onClick={() => { setOpen(false); onClose(); }}>Close project</button>
        </div>
      )}
      {open && <button className="project-menu-dismiss" aria-label="Close project menu" onClick={() => setOpen(false)} />}
    </div>
  );
}

import type { ProjectRef, Workspace } from "@ainide/shared";

export const RECENT_PROJECTS_KEY = "ainide:recent-projects";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isRecentProject(value: unknown): value is ProjectRef {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Partial<ProjectRef>;
  return nonEmptyString(project.projectId) && nonEmptyString(project.rootPath) && nonEmptyString(project.name);
}

export function deduplicateRecentProjects(projects: readonly ProjectRef[]): ProjectRef[] {
  const seen = new Set<string>();
  return projects.filter((project) => {
    if (seen.has(project.projectId)) return false;
    seen.add(project.projectId);
    return true;
  });
}

export function rememberRecentProject(projects: readonly ProjectRef[], project: ProjectRef): ProjectRef[] {
  return deduplicateRecentProjects([project, ...projects]);
}

export function projectRefFromMutation(workspace: Workspace | null | undefined, projectId: string | null | undefined): ProjectRef | undefined {
  if (!workspace || !projectId) return undefined;
  const project = { projectId, rootPath: workspace.rootPath, name: workspace.name };
  return isRecentProject(project) ? project : undefined;
}

export function readRecentProjects(storage: StorageReader | undefined = browserStorage()): ProjectRef[] {
  if (!storage) return [];
  try {
    const value = storage.getItem(RECENT_PROJECTS_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? deduplicateRecentProjects(parsed.filter(isRecentProject)) : [];
  } catch {
    return [];
  }
}

export function writeRecentProjects(projects: readonly ProjectRef[], storage: StorageWriter | undefined = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(deduplicateRecentProjects(projects.filter(isRecentProject))));
  } catch {
    // Browser storage is optional convenience metadata.
  }
}

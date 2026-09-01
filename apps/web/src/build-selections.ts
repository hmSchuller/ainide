import type { BuildCommand } from "@ainide/shared";

export const BUILD_SELECTIONS_KEY = "ainide:build-selections";

export function readBuildSelections(storage: Pick<Storage, "getItem"> = localStorage): Record<string, string> {
  try {
    const raw = storage.getItem(BUILD_SELECTIONS_KEY);
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const selections: Record<string, string> = {};
    for (const [projectId, label] of Object.entries(value as Record<string, unknown>)) {
      if (projectId && typeof label === "string" && label) selections[projectId] = label;
    }
    return selections;
  } catch {
    return {};
  }
}

export function persistBuildSelection(projectId: string, label: string, storage: Pick<Storage, "getItem" | "setItem"> = localStorage): void {
  const selections = readBuildSelections(storage);
  selections[projectId] = label;
  storage.setItem(BUILD_SELECTIONS_KEY, JSON.stringify(selections));
}

export function resolveBuildSelection(commands: BuildCommand[], remembered: string | undefined): string | undefined {
  if (!commands.length) return undefined;
  if (remembered && commands.some((command) => command.label === remembered)) return remembered;
  return commands[0]?.label;
}
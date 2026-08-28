import type { AppMode } from "./types";

export const PRIMARY_MODES: readonly AppMode[] = ["edit", "review", "agents", "lazygit"];

export const PRIMARY_MODE_LABELS: Record<AppMode, string> = {
  edit: "Edit",
  review: "Review",
  agents: "Agents",
  lazygit: "LazyGit",
};

export function modeUsesNumericShortcut(_mode: AppMode): boolean {
  return false;
}

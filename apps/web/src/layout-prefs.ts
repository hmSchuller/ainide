import type { AppMode } from "./types";

export const TERMINAL_COLLAPSED_KEY = "ainide:terminal-collapsed";
export const AGENT_NAVIGATOR_COLLAPSED_KEY = "ainide:agent-navigator-collapsed";

export function readTerminalCollapsedPreference(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  const value = storage.getItem(TERMINAL_COLLAPSED_KEY);
  if (value === "true") return true;
  if (value === "false") return false;
  return true;
}

export function persistTerminalCollapsed(collapsed: boolean, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(TERMINAL_COLLAPSED_KEY, String(collapsed));
}

export function shouldShowReferenceDock(itemCount: number): boolean {
  return itemCount > 0;
}

export function terminalPanelVisible(mode: AppMode): boolean {
  return mode === "edit" || mode === "review" || mode === "agents" || mode === "lazygit";
}

export function workbenchClassName(mode: AppMode): string {
  if (mode === "review") return "workbench review-mode";
  if (mode === "agents") return "workbench agents-mode";
  return "workbench";
}

export function shouldDismissExplorerPresentation(mode: AppMode): boolean {
  return mode === "review" || mode === "agents";
}

export function readAgentNavigatorCollapsedPreference(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  const value = storage.getItem(AGENT_NAVIGATOR_COLLAPSED_KEY);
  if (value === "true") return true;
  if (value === "false") return false;
  return false;
}

export function persistAgentNavigatorCollapsed(collapsed: boolean, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(AGENT_NAVIGATOR_COLLAPSED_KEY, String(collapsed));
}

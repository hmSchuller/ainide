import type { AppMode } from "./types";

export const TERMINAL_COLLAPSED_KEY = "ainide:terminal-collapsed";

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
  return mode === "review" ? "workbench review-mode" : "workbench";
}

export function shouldDismissExplorerPresentation(mode: AppMode): boolean {
  return mode === "review";
}

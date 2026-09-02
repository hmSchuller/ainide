import type { TerminalKind, TerminalSession } from "@ainide/shared";

export const UTILITY_TERMINAL_KINDS: readonly TerminalKind[] = ["shell", "custom", "build"];

export function utilityTerminals(terminals: TerminalSession[], projectId?: string): TerminalSession[] {
  return terminals.filter((terminal) => terminal.projectId === projectId && UTILITY_TERMINAL_KINDS.includes(terminal.kind));
}

export function lazygitTerminals(terminals: TerminalSession[], projectId?: string): TerminalSession[] {
  return terminals.filter((terminal) => terminal.projectId === projectId && terminal.kind === "lazygit");
}

export function agentTerminals(terminals: TerminalSession[], projectId?: string): TerminalSession[] {
  return terminals.filter((terminal) => terminal.projectId === projectId && terminal.kind === "agent");
}

export function selectLazygitSession(terminals: TerminalSession[], preferredId?: string): TerminalSession | undefined {
  if (preferredId) {
    const preferred = terminals.find((terminal) => terminal.id === preferredId);
    if (preferred) return preferred;
  }
  return terminals.find((terminal) => terminal.alive) ?? terminals[0];
}

export function shouldStartLazygitSession(terminals: TerminalSession[]): boolean {
  return terminals.length === 0;
}

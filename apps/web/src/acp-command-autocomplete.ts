import type { AcpCommand } from "@ainide/shared";

export interface AcpCommandMatch {
  query: string;
  start: number;
  end: number;
}

export interface AcpCommandInsertion {
  text: string;
  caret: number;
}

export type AcpClientCommandKind = "new";

export interface AcpClientCommand {
  kind: AcpClientCommandKind;
  name: string;
  description: string;
}

export type AcpCommandSuggestion =
  | { kind: "client"; command: AcpClientCommand }
  | { kind: "provider"; command: AcpCommand };

export const CLIENT_ACP_COMMANDS: readonly AcpClientCommand[] = [
  { kind: "new", name: "new", description: "Start a fresh context on this provider" },
];

export function matchAcpCommandToken(text: string, caret: number): AcpCommandMatch | undefined {
  const position = Math.max(0, Math.min(caret, text.length));
  const beforeCaret = text.slice(0, position);
  const match = beforeCaret.match(/(?:^|\s)\/([^\s]*)$/);
  if (!match || match.index === undefined) return undefined;
  const start = match.index + (match[0].startsWith("/") ? 0 : 1);
  return { query: match[1] ?? "", start, end: position };
}

export function filterAcpSuggestions(commands: AcpCommand[], query: string): AcpCommandSuggestion[] {
  const normalizedQuery = query.toLowerCase();
  const matches = (name: string) => name.toLowerCase().startsWith(normalizedQuery);
  return [
    ...CLIENT_ACP_COMMANDS.filter((command) => matches(command.name)).map((command): AcpCommandSuggestion => ({ kind: "client", command })),
    ...commands.filter((command) => matches(command.name)).map((command): AcpCommandSuggestion => ({ kind: "provider", command })),
  ];
}

export function filterAcpCommands(commands: AcpCommand[], query: string): AcpCommand[] {
  const normalizedQuery = query.toLowerCase();
  return commands.filter((command) => command.name.toLowerCase().startsWith(normalizedQuery));
}

export function moveAcpCommandIndex(index: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return 0;
  return (index + direction + count) % count;
}

export function insertAcpCommand(text: string, match: AcpCommandMatch, command: AcpCommand): AcpCommandInsertion {
  const inserted = `/${command.name} `;
  return { text: `${text.slice(0, match.start)}${inserted}${text.slice(match.end)}`, caret: match.start + inserted.length };
}

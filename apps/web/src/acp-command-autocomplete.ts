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

function isInOrderSubsequence(segment: string, query: string): boolean {
  let queryIndex = 0;
  for (const char of segment) {
    if (char === query[queryIndex]) {
      queryIndex++;
      if (queryIndex === query.length) return true;
    }
  }
  return queryIndex === query.length;
}

export function commandMatchScore(name: string, query: string): number {
  const normalizedName = name.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (!normalizedQuery) return 0;

  const maxScore = normalizedQuery.length <= 2 ? 2 : normalizedQuery.length === 3 ? 3 : 4;
  const scores: number[] = [];

  if (normalizedName.startsWith(normalizedQuery)) {
    scores.push(1);
  }

  for (const segment of normalizedName.split("-")) {
    if (segment.startsWith(normalizedQuery)) {
      scores.push(2);
    }
    if (normalizedQuery.length >= 3 && segment.includes(normalizedQuery)) {
      scores.push(3);
    }
    if (normalizedQuery.length >= 4 && isInOrderSubsequence(segment, normalizedQuery)) {
      scores.push(4);
    }
  }

  const validScores = scores.filter((score) => score <= maxScore);
  if (validScores.length === 0) return -1;
  return Math.min(...validScores);
}

function suggestionKindOrder(kind: AcpCommandSuggestion["kind"]): number {
  return kind === "client" ? 0 : 1;
}

function compareSuggestions(left: AcpCommandSuggestion, right: AcpCommandSuggestion, query: string): number {
  const scoreDifference = commandMatchScore(left.command.name, query) - commandMatchScore(right.command.name, query);
  if (scoreDifference !== 0) return scoreDifference;
  const kindDifference = suggestionKindOrder(left.kind) - suggestionKindOrder(right.kind);
  if (kindDifference !== 0) return kindDifference;
  return left.command.name.localeCompare(right.command.name);
}

export function matchAcpCommandToken(text: string, caret: number): AcpCommandMatch | undefined {
  const position = Math.max(0, Math.min(caret, text.length));
  const beforeCaret = text.slice(0, position);
  const match = beforeCaret.match(/(?:^|\s)\/([^\s]*)$/);
  if (!match || match.index === undefined) return undefined;
  const start = match.index + (match[0].startsWith("/") ? 0 : 1);
  return { query: match[1] ?? "", start, end: position };
}

export function filterAcpSuggestions(commands: AcpCommand[], query: string): AcpCommandSuggestion[] {
  const suggestions: AcpCommandSuggestion[] = [
    ...CLIENT_ACP_COMMANDS.map((command): AcpCommandSuggestion => ({ kind: "client", command })),
    ...commands.map((command): AcpCommandSuggestion => ({ kind: "provider", command })),
  ];

  return suggestions
    .filter((suggestion) => commandMatchScore(suggestion.command.name, query) >= 0)
    .sort((left, right) => compareSuggestions(left, right, query));
}

export function filterAcpCommands(commands: AcpCommand[], query: string): AcpCommand[] {
  return commands
    .filter((command) => commandMatchScore(command.name, query) >= 0)
    .sort((left, right) => {
      const scoreDifference = commandMatchScore(left.name, query) - commandMatchScore(right.name, query);
      return scoreDifference || left.name.localeCompare(right.name);
    });
}

export function moveAcpCommandIndex(index: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return 0;
  return (index + direction + count) % count;
}

export function insertAcpCommand(text: string, match: AcpCommandMatch, command: AcpCommand): AcpCommandInsertion {
  const inserted = `/${command.name} `;
  return { text: `${text.slice(0, match.start)}${inserted}${text.slice(match.end)}`, caret: match.start + inserted.length };
}

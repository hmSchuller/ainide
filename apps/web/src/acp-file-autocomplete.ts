import type { FileEntry } from "@ainide/shared";

export interface AcpFileMatch {
  query: string;
  start: number;
  end: number;
}

export interface AcpFileInsertion {
  text: string;
  caret: number;
  mention: string;
}

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isWorkspaceFilePath(path: string): boolean {
  const value = normalizedPath(path);
  return Boolean(value) && !value.startsWith("/") && !/^[a-zA-Z]:\//.test(value) && !value.split("/").some((part) => part === ".." || part === "");
}

export function matchAcpFileToken(text: string, caret: number): AcpFileMatch | undefined {
  const position = Math.max(0, Math.min(caret, text.length));
  const beforeCaret = text.slice(0, position);
  const match = beforeCaret.match(/(?:^|\s)@([^\s]*)$/);
  if (!match || match.index === undefined) return undefined;
  const start = match.index + (match[0].startsWith("@") ? 0 : 1);
  return { query: match[1] ?? "", start, end: position };
}

function fileMatchScore(file: FileEntry, query: string): number {
  const path = normalizedPath(file.path).toLowerCase();
  const name = file.name.toLowerCase();
  if (!query) return 0;
  if (path === query) return 0;
  if (path.startsWith(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (path.includes(query)) return 3;
  return -1;
}

export function filterAcpFiles(files: FileEntry[], query: string): FileEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  const unique = new Map<string, FileEntry>();
  for (const file of files) {
    const path = normalizedPath(file.path);
    if (file.type !== "file" || !isWorkspaceFilePath(path) || unique.has(path)) continue;
    const score = fileMatchScore({ ...file, path }, normalizedQuery);
    if (score < 0) continue;
    unique.set(path, { ...file, path });
  }
  return [...unique.values()].sort((left, right) => {
    const scoreDifference = fileMatchScore(left, normalizedQuery) - fileMatchScore(right, normalizedQuery);
    return scoreDifference || left.path.localeCompare(right.path);
  });
}

export function moveAcpFileIndex(index: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return 0;
  return (index + direction + count) % count;
}

export function insertAcpFile(text: string, match: AcpFileMatch, file: Pick<FileEntry, "path">): AcpFileInsertion {
  const mention = `@${normalizedPath(file.path)} `;
  return { text: `${text.slice(0, match.start)}${mention}${text.slice(match.end)}`, caret: match.start + mention.length, mention };
}

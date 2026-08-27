export interface CodeSelection {
  startLineNumber: number;
  endLineNumber: number;
}

export interface ReferenceItem {
  id: string;
  path: string;
  startLine?: number;
  endLine?: number;
  wholeFile: boolean;
  content: string;
  language: string;
}

export interface ClipboardResult {
  ok: boolean;
  error?: string;
}

export interface TextFileResult {
  content: string;
  binary: boolean;
}

function referenceId(): string {
  const crypto = globalThis.crypto as Crypto & { randomUUID?: () => string } | undefined;
  return crypto?.randomUUID?.() ?? `reference-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizedLines(selection: CodeSelection): { startLine: number; endLine: number } {
  const startLine = Math.max(1, Math.min(selection.startLineNumber, selection.endLineNumber));
  const endLine = Math.max(startLine, Math.max(selection.startLineNumber, selection.endLineNumber));
  return { startLine, endLine };
}

export function captureSelectionReference(input: {
  path: string;
  content: string;
  language: string;
  selection: CodeSelection;
}): ReferenceItem {
  const { startLine, endLine } = normalizedLines(input.selection);
  const lines = input.content.split("\n");
  const content = lines.slice(startLine - 1, endLine).join("\n");
  return {
    id: referenceId(),
    path: cleanPath(input.path),
    startLine,
    endLine,
    wholeFile: false,
    content,
    language: input.language,
  };
}

export function captureFileReference(input: { path: string; content: string; language: string }): ReferenceItem {
  return {
    id: referenceId(),
    path: cleanPath(input.path),
    wholeFile: true,
    content: input.content,
    language: input.language,
  };
}

export async function captureTextFileReference(input: {
  path: string;
  language: string;
  visible?: TextFileResult;
  read: () => Promise<TextFileResult>;
}): Promise<ReferenceItem> {
  const result = input.visible ?? await input.read();
  if (result.binary) throw new Error("This file cannot be copied as text");
  return captureFileReference({ path: input.path, content: result.content, language: input.language });
}

function scope(item: ReferenceItem): string {
  if (item.wholeFile) return "whole file";
  return `lines ${item.startLine ?? 1}-${item.endLine ?? item.startLine ?? 1}`;
}

function fenceFor(content: string): string {
  const runs = content.match(/`+/g) ?? [];
  const longest = runs.reduce((length, run) => Math.max(length, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

export function serializeReference(item: ReferenceItem): string {
  const fence = fenceFor(item.content);
  return `--- ${item.path} (${scope(item)}) ---\n${fence}${item.language || "text"}\n${item.content}\n${fence}`;
}

export function serializeReferenceKit(items: ReferenceItem[]): string {
  return items.map(serializeReference).join("\n\n");
}

export async function copyText(text: string, writeText: (value: string) => Promise<void> = (value) => navigator.clipboard.writeText(value)): Promise<ClipboardResult> {
  try {
    await writeText(text);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Clipboard access failed" };
  }
}

export function copyReference(item: ReferenceItem, writeText?: (value: string) => Promise<void>): Promise<ClipboardResult> {
  return copyText(serializeReference(item), writeText);
}

export function copyReferenceKit(items: ReferenceItem[], writeText?: (value: string) => Promise<void>): Promise<ClipboardResult> {
  return copyText(serializeReferenceKit(items), writeText);
}

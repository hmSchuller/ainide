import type { AcpPromptContext } from "@ainide/shared";

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
  comment?: string;
  mention?: string;
  mentionStart?: number;
  mentionBefore?: string;
  mentionAfter?: string;
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

export function captureMentionedFileReference(input: { path: string; content: string; language: string; mention: string; mentionStart?: number; mentionBefore?: string; mentionAfter?: string }): ReferenceItem {
  return {
    ...captureFileReference(input),
    mention: input.mention,
    ...(input.mentionStart === undefined ? {} : { mentionStart: input.mentionStart }),
    ...(input.mentionBefore === undefined ? {} : { mentionBefore: input.mentionBefore }),
    ...(input.mentionAfter === undefined ? {} : { mentionAfter: input.mentionAfter }),
  };
}

export function removeGeneratedReferenceMention(text: string, reference: ReferenceItem): string {
  if (!reference.mention) return text;
  const mention = reference.mention;
  const start = reference.mentionStart;
  if (start !== undefined && text.slice(start, start + mention.length) === mention) {
    return `${text.slice(0, start)}${text.slice(start + mention.length)}`;
  }
  const before = reference.mentionBefore;
  const after = reference.mentionAfter;
  if (before !== undefined || after !== undefined) {
    let offset = text.indexOf(mention);
    while (offset >= 0) {
      if ((before === undefined || text.slice(0, offset).endsWith(before)) && (after === undefined || text.slice(offset + mention.length).startsWith(after))) {
        return `${text.slice(0, offset)}${text.slice(offset + mention.length)}`;
      }
      offset = text.indexOf(mention, offset + 1);
    }
    return text;
  }
  const first = text.indexOf(mention);
  if (first < 0 || text.indexOf(mention, first + mention.length) >= 0) return text;
  return `${text.slice(0, first)}${text.slice(first + mention.length)}`;
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

export function normalizeReferenceComment(comment?: string): string | undefined {
  const trimmed = comment?.trim();
  return trimmed ? trimmed : undefined;
}

export function referenceProvenanceLine(item: ReferenceItem): string {
  if (item.wholeFile) return item.path;
  const start = item.startLine ?? 1;
  const end = item.endLine ?? start;
  return start === end ? `${item.path}:L${start}` : `${item.path}:L${start}-L${end}`;
}

export function referenceScopeDescription(item: ReferenceItem): string {
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
  const blocks = [referenceProvenanceLine(item)];
  if (item.comment) blocks.push(item.comment);
  blocks.push(`${fence}${item.language || "text"}\n${item.content}\n${fence}`);
  return blocks.join("\n\n");
}

export function serializeReferenceKit(items: ReferenceItem[]): string {
  return items.map(serializeReference).join("\n\n");
}

export function appendReferenceItems(current: ReferenceItem[], additions: ReferenceItem[]): ReferenceItem[] {
  return additions.reduce((next, item) => {
    const duplicate = next.some((reference) => reference.id === item.id || (reference.wholeFile && item.wholeFile && reference.path === item.path));
    return duplicate ? next : [...next, item];
  }, [...current]);
}

export function promptContextFromReferences(items: ReferenceItem[]): AcpPromptContext[] {
  return items.map((reference) => ({
    path: reference.path,
    content: reference.content,
    language: reference.language,
    ...(reference.startLine ? { startLine: reference.startLine } : {}),
    ...(reference.endLine ? { endLine: reference.endLine } : {}),
    ...(reference.comment ? { comment: reference.comment } : {}),
  }));
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

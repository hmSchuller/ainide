import { describe, expect, it } from "vitest";
import { language } from "./file-language";
import { appendReferenceItems, captureFileReference, captureMentionedFileReference, captureSelectionReference, captureTextFileReference, copyReferenceKit, normalizeReferenceComment, promptContextFromReferences, removeGeneratedReferenceMention, serializeReference, serializeReferenceKit } from "./references";

describe("references", () => {
  it("normalizes a selection to inclusive complete lines", () => {
    const reference = captureSelectionReference({
      path: "./src/demo.ts",
      language: "typescript",
      content: "one\ntwo\nthree\nfour",
      selection: { startLineNumber: 3, endLineNumber: 2 },
    });
    expect(reference).toMatchObject({ path: "src/demo.ts", startLine: 2, endLine: 3, content: "two\nthree", wholeFile: false });
  });

  it("uses visible unsaved content and rejects binary or unreadable text", async () => {
    const visible = await captureTextFileReference({
      path: "src/unsaved.ts",
      language: "typescript",
      visible: { content: "visible", binary: false },
      read: async () => ({ content: "disk", binary: false }),
    });
    expect(visible.content).toBe("visible");
    await expect(captureTextFileReference({ path: "image.png", language: "image", visible: { content: "", binary: true }, read: async () => ({ content: "", binary: true }) })).rejects.toThrow("cannot be copied as text");
    await expect(captureTextFileReference({ path: "missing.ts", language: "typescript", read: async () => { throw new Error("read failed"); } })).rejects.toThrow("read failed");
  });

  it("serializes whole files and ordered kits with safe fences", () => {
    const first = captureFileReference({ path: "z.ts", language: "typescript", content: "const end = ` ```;" });
    const second = captureSelectionReference({ path: "a.ts", language: "typescript", content: "a\nb", selection: { startLineNumber: 1, endLineNumber: 1 } });
    const text = serializeReference(first);
    expect(text).toContain("z.ts\n\n````typescript");
    expect(serializeReferenceKit([first, second])).toBe(`${serializeReference(first)}\n\n${serializeReference(second)}`);
  });

  it("serializes annotated selections with provenance, comment, and snippet", () => {
    const lines = Array.from({ length: 48 }, (_, index) => `line ${index + 1}`);
    lines[41] = "if (user == null) return;";
    const reference = captureSelectionReference({
      path: "src/app.ts",
      language: "typescript",
      content: lines.join("\n"),
      selection: { startLineNumber: 42, endLineNumber: 48 },
    });
    const annotated = { ...reference, comment: "Fix the null check" };
    expect(serializeReference(annotated)).toContain("src/app.ts:L42-L48\n\nFix the null check\n\n```typescript\n");
    expect(serializeReference(annotated)).toContain("if (user == null) return;");
    expect(promptContextFromReferences([annotated])).toEqual([{
      path: "src/app.ts",
      content: reference.content,
      language: "typescript",
      startLine: 42,
      endLine: 48,
      comment: "Fix the null check",
    }]);
  });

  it("serializes whole files with optional comments and omits empty comments", () => {
    const reference = { ...captureFileReference({ path: "src/types.ts", language: "typescript", content: "export type User = { id: string };" }), comment: "Context for the refactor" };
    expect(serializeReference(reference)).toContain("src/types.ts\n\nContext for the refactor\n\n```typescript");
    const plain = captureFileReference({ path: "src/types.ts", language: "typescript", content: "export type User = { id: string };" });
    expect(serializeReference(plain)).toBe("src/types.ts\n\n```typescript\nexport type User = { id: string };\n```");
    expect(normalizeReferenceComment("  note  ")).toBe("note");
    expect(normalizeReferenceComment("   ")).toBeUndefined();
  });

  it("preserves Swift and Kotlin language IDs in references and ACP context", () => {
    const sources = [
      { path: "Sources/App.swift", content: "let app = true", expectedLanguage: "swift" },
      { path: "src/Main.kt", content: "val main = true", expectedLanguage: "kotlin" },
      { path: "build.gradle.kts", content: "val build = true", expectedLanguage: "kotlin" },
    ];

    for (const source of sources) {
      const languageId = language(source.path);
      const file = captureFileReference({ path: source.path, content: source.content, language: languageId });
      const selection = captureSelectionReference({ path: source.path, content: source.content, language: languageId, selection: { startLineNumber: 1, endLineNumber: 1 } });

      expect(file.language).toBe(source.expectedLanguage);
      expect(selection.language).toBe(source.expectedLanguage);
      expect(serializeReference(file)).toContain(`\`\`\`${source.expectedLanguage}`);
      expect(promptContextFromReferences([selection])).toEqual([{ path: source.path, content: source.content, language: source.expectedLanguage, startLine: 1, endLine: 1 }]);
    }
  });

  it("does not consume a kit when clipboard writes fail or repeat", async () => {
    const kit = [captureFileReference({ path: "a.ts", language: "typescript", content: "a" })];
    const writes: string[] = [];
    const writer = async (value: string) => { writes.push(value); };
    expect((await copyReferenceKit(kit, writer)).ok).toBe(true);
    expect((await copyReferenceKit(kit, writer)).ok).toBe(true);
    expect(writes[0]).toBe(writes[1]);
    expect(kit).toHaveLength(1);
    expect((await copyReferenceKit(kit, async () => { throw new Error("denied"); })).error).toBe("denied");
    expect(kit).toHaveLength(1);
  });

  it("keeps ACP handoff drafts explicit, deduplicated, and provenance-aware", () => {
    const selected = captureSelectionReference({ path: "src/dirty.ts", language: "typescript", content: "one\ntwo\nthree", selection: { startLineNumber: 2, endLineNumber: 3 } });
    const current = appendReferenceItems([], [selected]);
    expect(appendReferenceItems(current, [selected])).toHaveLength(1);
    expect(promptContextFromReferences(current)).toEqual([{ path: "src/dirty.ts", content: "two\nthree", language: "typescript", startLine: 2, endLine: 3 }]);
  });

  it("tracks and removes an identifiable generated ACP mention only", () => {
    const reference = captureMentionedFileReference({ path: "src/app.ts", language: "typescript", content: "disk", mention: "@src/app.ts ", mentionStart: 7, mentionBefore: "before ", mentionAfter: " after" });
    expect(reference.mention).toBe("@src/app.ts ");
    expect(removeGeneratedReferenceMention("before @src/app.ts  after", reference)).toBe("before  after");
    expect(removeGeneratedReferenceMention("before @src/other.ts after", reference)).toBe("before @src/other.ts after");
    expect(promptContextFromReferences([reference])).toEqual([{ path: "src/app.ts", content: "disk", language: "typescript" }]);
    const repeatedText = "@src/app.ts before @src/app.ts ";
    const repeated = captureMentionedFileReference({ path: "src/app.ts", language: "typescript", content: "disk", mention: "@src/app.ts ", mentionStart: 19, mentionBefore: "@src/app.ts before ", mentionAfter: "" });
    expect(removeGeneratedReferenceMention(repeatedText, repeated)).toBe("@src/app.ts before ");
  });

  it("deduplicates repeated whole-file context by workspace path", () => {
    const first = captureFileReference({ path: "src/app.ts", language: "typescript", content: "disk" });
    const second = captureFileReference({ path: "src/app.ts", language: "typescript", content: "newer disk" });
    expect(appendReferenceItems([], [first, second])).toEqual([first]);
  });

  it("includes dock-edited comments when serializing a kit for handoff", () => {
    const item = { ...captureFileReference({ path: "src/app.ts", language: "typescript", content: "const value = 1;" }), comment: "Check this helper" };
    expect(serializeReferenceKit([item])).toContain("Check this helper");
  });

  it("keeps copy-as-reference serialization immediate without requiring a comment", () => {
    const reference = captureSelectionReference({
      path: "src/app.ts",
      language: "typescript",
      content: "const value = 1;",
      selection: { startLineNumber: 1, endLineNumber: 1 },
    });
    expect(serializeReference(reference)).toBe("src/app.ts:L1\n\n```typescript\nconst value = 1;\n```");
  });
});

import { describe, expect, it } from "vitest";
import { appendReferenceItems, captureFileReference, captureSelectionReference, captureTextFileReference, copyReferenceKit, promptContextFromReferences, serializeReference, serializeReferenceKit } from "./references";

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
    expect(text).toContain("z.ts (whole file)");
    expect(text).toContain("````typescript");
    expect(serializeReferenceKit([first, second])).toBe(`${serializeReference(first)}\n\n${serializeReference(second)}`);
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
});

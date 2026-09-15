import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { captureSelectionReference, normalizeReferenceComment } from "../references";
import { ReferenceAnnotationDialog, referenceAnnotationSubmitShortcut } from "./ReferenceAnnotationDialog";

const reference = captureSelectionReference({
  path: "src/app.ts",
  language: "typescript",
  content: "one\ntwo\nthree",
  selection: { startLineNumber: 2, endLineNumber: 3 },
});

describe("ReferenceAnnotationDialog", () => {
  it("renders path and scope for the pending reference", () => {
    const markup = renderToStaticMarkup(<ReferenceAnnotationDialog reference={reference} onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(markup).toContain("src/app.ts");
    expect(markup).toContain("lines 2-3");
    expect(markup).toContain("What should the agent know?");
    expect(markup).toContain("Add to kit");
  });

  it("supports editing an existing note", () => {
    const markup = renderToStaticMarkup(<ReferenceAnnotationDialog reference={reference} initialComment="Fix this" eyebrow="EDIT NOTE" confirmLabel="Save" onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(markup).toContain("EDIT NOTE");
    expect(markup).toContain("Save");
    expect(markup).toContain("Fix this");
  });

  it("normalizes optional comments for confirm handlers", () => {
    expect(normalizeReferenceComment("  fix this  ")).toBe("fix this");
    expect(normalizeReferenceComment("   ")).toBeUndefined();
    expect(normalizeReferenceComment(undefined)).toBeUndefined();
  });

  it("submits on command-enter but keeps plain enter as a newline", () => {
    expect(referenceAnnotationSubmitShortcut({ key: "Enter", metaKey: true })).toBe(true);
    expect(referenceAnnotationSubmitShortcut({ key: "Enter", ctrlKey: true })).toBe(true);
    expect(referenceAnnotationSubmitShortcut({ key: "Enter" })).toBe(false);
    expect(referenceAnnotationSubmitShortcut({ key: "Enter", shiftKey: true } as { key: string; metaKey?: boolean; ctrlKey?: boolean })).toBe(false);
    expect(referenceAnnotationSubmitShortcut({ key: "Enter", metaKey: true, isComposing: true })).toBe(false);
  });
});

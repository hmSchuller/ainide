import type { editor as MonacoEditor } from "monaco-editor";

export interface AnnotationAnchor {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function anchorFromClientRect(rect: DOMRect): AnnotationAnchor {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export function positionAnnotationDialog(anchor: AnnotationAnchor, dialog: { width: number; height: number }, margin = 10, viewport = { width: window.innerWidth, height: window.innerHeight }): { top: number; left: number } {
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;
  const anchorCenter = anchor.left + anchor.width / 2;
  let left = anchorCenter - dialog.width / 2;
  let top = anchor.top + anchor.height + margin;
  if (top + dialog.height > viewportHeight - margin) top = anchor.top - dialog.height - margin;
  left = Math.max(margin, Math.min(left, viewportWidth - dialog.width - margin));
  top = Math.max(margin, Math.min(top, viewportHeight - dialog.height - margin));
  return { top, left };
}

export function centeredAnnotationDialog(dialog: { width: number; height: number }, margin = 24, viewport = { width: window.innerWidth, height: window.innerHeight }): { top: number; left: number } {
  return {
    top: Math.max(margin, (viewport.height - dialog.height) / 2),
    left: Math.max(margin, (viewport.width - dialog.width) / 2),
  };
}

function editorVisibleAnchor(editor: MonacoEditor.IStandaloneCodeEditor, lineNumber: number, column: number): AnnotationAnchor | undefined {
  const coords = editor.getScrolledVisiblePosition({ lineNumber, column });
  const dom = editor.getDomNode();
  if (!coords || !dom) return undefined;
  const rect = dom.getBoundingClientRect();
  return {
    top: rect.top + coords.top,
    left: rect.left + coords.left,
    width: Math.max("width" in coords && typeof coords.width === "number" ? coords.width : 8, 24),
    height: coords.height ?? 18,
  };
}

export function editorSelectionAnchor(editor: MonacoEditor.IStandaloneCodeEditor): AnnotationAnchor | undefined {
  const selection = editor.getSelection();
  if (!selection) return undefined;
  const startLine = Math.min(selection.startLineNumber, selection.endLineNumber);
  const endLine = Math.max(selection.startLineNumber, selection.endLineNumber);
  const startColumn = selection.startLineNumber <= selection.endLineNumber ? selection.startColumn : selection.endColumn;
  const endColumn = selection.startLineNumber <= selection.endLineNumber ? selection.endColumn : selection.startColumn;
  const start = editorVisibleAnchor(editor, startLine, startColumn);
  const end = editorVisibleAnchor(editor, endLine, endColumn);
  if (start && end) {
    return {
      top: start.top,
      left: Math.min(start.left, end.left),
      width: Math.max(start.width, end.left - start.left + end.width),
      height: Math.max(start.height, end.top + end.height - start.top),
    };
  }
  return start ?? end;
}

export function editorCursorAnchor(editor: MonacoEditor.IStandaloneCodeEditor): AnnotationAnchor | undefined {
  const position = editor.getPosition();
  if (!position) return undefined;
  return editorVisibleAnchor(editor, position.lineNumber, position.column);
}

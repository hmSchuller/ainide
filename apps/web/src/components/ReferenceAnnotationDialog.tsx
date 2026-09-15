import { useLayoutEffect, useRef, useState } from "react";
import type { AnnotationAnchor } from "../annotation-anchor";
import { centeredAnnotationDialog, positionAnnotationDialog } from "../annotation-anchor";
import { useDialogFocus } from "../accessibility";
import type { ReferenceItem } from "../references";
import { normalizeReferenceComment, referenceScopeDescription } from "../references";

export interface ReferenceAnnotationDialogProps {
  reference: ReferenceItem;
  anchor?: AnnotationAnchor;
  initialComment?: string;
  eyebrow?: string;
  confirmLabel?: string;
  onConfirm: (comment?: string) => void;
  onCancel: () => void;
}

export function referenceAnnotationSubmitShortcut(input: { key: string; metaKey?: boolean; ctrlKey?: boolean; isComposing?: boolean }): boolean {
  if (input.isComposing) return false;
  return input.key === "Enter" && Boolean(input.metaKey || input.ctrlKey);
}

export function ReferenceAnnotationDialog({ reference, anchor, initialComment = "", eyebrow = "ADD REFERENCE", confirmLabel = "Add to kit", onConfirm, onCancel }: ReferenceAnnotationDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [comment, setComment] = useState(initialComment);
  const [position, setPosition] = useState<{ top: number; left: number }>();
  useDialogFocus(dialogRef, "[data-dialog-initial-focus]", onCancel);
  const confirm = () => onConfirm(normalizeReferenceComment(comment));

  useLayoutEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    setPosition(anchor ? positionAnnotationDialog(anchor, { width, height }) : centeredAnnotationDialog({ width, height }));
  }, [anchor, eyebrow, confirmLabel, reference.id, reference.path]);

  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss; the dialog itself owns close/Escape */
    <div className="overlay reference-annotation-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section ref={dialogRef} className="reference-annotation-dialog" style={position ? { top: position.top, left: position.left } : undefined} role="dialog" aria-modal="true" aria-labelledby="reference-annotation-title" tabIndex={-1}>
        <header className="reference-annotation-header">
          <span className="eyebrow">{eyebrow}</span>
          <h2 id="reference-annotation-title">{reference.path}</h2>
          <p>{referenceScopeDescription(reference)}</p>
        </header>
        <label className="reference-annotation-field">
          <span>What should the agent know?</span>
          <textarea
            data-dialog-initial-focus
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (!referenceAnnotationSubmitShortcut({ key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, isComposing: event.nativeEvent.isComposing })) return;
              event.preventDefault();
              confirm();
            }}
            placeholder="Optional note for the agent"
            rows={4}
          />
        </label>
        <div className="reference-annotation-actions">
          <button type="button" className="reference-annotation-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary-button compact" onClick={confirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

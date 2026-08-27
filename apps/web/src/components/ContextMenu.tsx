import { useEffect } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const pointerdown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".context-menu")) onClose();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointerdown", pointerdown);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("pointerdown", pointerdown);
    };
  }, [onClose]);

  return createPortal(
    <div className="context-menu" style={{ top: y, left: x }} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          className={item.danger ? "danger" : ""}
          disabled={item.disabled}
          role="menuitem"
          type="button"
          onClick={() => {
            if (item.disabled) return;
            item.run();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

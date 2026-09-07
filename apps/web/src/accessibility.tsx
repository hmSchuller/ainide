import { useEffect, useRef, useState } from "react";
import type { Notice } from "./types";

export const MAX_ACCESSIBLE_ANNOUNCEMENT_LENGTH = 240;
const MAX_SEEN_ANNOUNCEMENTS = 100;

export function boundedAnnouncement(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > MAX_ACCESSIBLE_ANNOUNCEMENT_LENGTH
    ? `${text.slice(0, MAX_ACCESSIBLE_ANNOUNCEMENT_LENGTH - 1).trimEnd()}…`
    : text;
}

export function announcementForNotice(notice: Notice): { text: string; assertive: boolean } | undefined {
  const text = notice.text.toLowerCase();
  const relevant = text.includes("cancel")
    || text.includes("exit")
    || text.includes("reconnect")
    || text.includes("authenticate")
    || text.includes("permission")
    || (notice.tone === "error" && /(failed|failure|could not|unavailable|disconnected|error)/.test(text));
  if (!relevant) return undefined;
  return { text: boundedAnnouncement(notice.text), assertive: notice.tone === "error" };
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return typeof HTMLElement !== "undefined" && target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select, [role=combobox]"));
}

interface AccessibleAnnouncementsProps {
  notices: Notice[];
}

export function AccessibleAnnouncements({ notices }: AccessibleAnnouncementsProps) {
  const seenNotices = useRef(new Set<number>());
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const [announcementVersion, setAnnouncementVersion] = useState(0);

  useEffect(() => {
    const fresh = notices.filter((notice) => !seenNotices.current.has(notice.id));
    for (const notice of fresh) {
      seenNotices.current.add(notice.id);
      if (seenNotices.current.size > MAX_SEEN_ANNOUNCEMENTS) seenNotices.current.delete(seenNotices.current.values().next().value as number);
    }
    const announcement = fresh.slice().reverse().map(announcementForNotice).find(Boolean);
    if (!announcement) return;
    setAnnouncementVersion((version) => version + 1);
    if (announcement.assertive) setAssertive(announcement.text);
    else setPolite(announcement.text);
  }, [notices]);

  return <>
    <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true"><span key={`assertive-${announcementVersion}`}>{assertive}</span></div>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true"><span key={`polite-${announcementVersion}`}>{polite}</span></div>
  </>;
}

export function useDialogFocus(dialogRef: import("react").RefObject<HTMLElement>, initialSelector = "[data-dialog-initial-focus]", onEscape?: () => void, active = true): void {
  const restoreTarget = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    restoreTarget.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"));
    const initial = dialog.querySelector<HTMLElement>(initialSelector) ?? focusable()[0];
    window.setTimeout(() => initial?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (onEscapeRef.current) { event.preventDefault(); onEscapeRef.current(); }
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      const target = restoreTarget.current;
      if (target?.isConnected) window.setTimeout(() => target.focus(), 0);
    };
  }, [active, dialogRef, initialSelector]);
}

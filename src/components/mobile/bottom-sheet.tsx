"use client";

import { useEffect } from "react";
import { useScrollLock } from "@/lib/use-scroll-lock";

/**
 * Mobile bottom-sheet primitive: a scrim that fades in and a white sheet that
 * slides up from the bottom. Dismisses on scrim tap, the close button, or Esc.
 * Caps at ~78% of the viewport with internal scroll, per the design spec.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  // Lock background scroll while the sheet is open so iOS momentum doesn't
  // bleed through the scrim and leave the page scrolled when it closes.
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(28,25,23,0.5)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[78vh] w-full max-w-[440px] flex-col rounded-t-[26px] bg-white pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgba(28,25,23,0.4)]"
      >
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-10 rounded-full bg-[#e7dcca]" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2">{children}</div>
      </div>
    </div>
  );
}

"use client";

// The enter/exit slide+fade is driven by toggling mount/visibility state in
// response to the `open` prop — an intentional external-synchronization effect.
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";

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
  // Mount/unmount with a beat so the enter/exit transitions can play.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 bg-[rgba(28,25,23,0.5)] transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[78vh] w-full max-w-[440px] flex-col rounded-t-[26px] bg-white pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgba(28,25,23,0.4)] transition-transform duration-[280ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-10 rounded-full bg-[#e7dcca]" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2">{children}</div>
      </div>
    </div>
  );
}

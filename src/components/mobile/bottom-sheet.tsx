"use client";

import { useEffect, useRef } from "react";
import {
  getFocusableElements,
  getInitialFocusTarget,
  nextFocusableIndex,
  shouldDismissLayer,
} from "@/lib/dialog-a11y";
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
  dismissDisabled = false,
  closeLabel = "Close sheet",
}: {
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  labelledBy?: string;
  dismissDisabled?: boolean;
  closeLabel?: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Lock background scroll while the sheet is open so iOS momentum doesn't
  // bleed through the scrim and leave the page scrolled when it closes.
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const sheet = sheetRef.current;
    if (sheet) {
      window.requestAnimationFrame(() => getInitialFocusTarget(sheet).focus());
    }
    return () => {
      const target = returnFocusRef.current;
      if (target && document.contains(target)) {
        target.focus();
      }
      returnFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  function dismiss(reason: "escape" | "backdrop" | "close-button") {
    if (shouldDismissLayer({ pending: dismissDisabled, reason })) {
      onClose();
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss("escape");
      return;
    }
    if (event.key !== "Tab" || !sheetRef.current) return;
    const focusable = getFocusableElements(sheetRef.current);
    event.preventDefault();
    if (focusable.length === 0) {
      sheetRef.current.focus();
      return;
    }
    const current = document.activeElement as HTMLElement | null;
    const currentIndex = current ? focusable.indexOf(current) : -1;
    const nextIndex = nextFocusableIndex(
      currentIndex,
      focusable.length,
      event.shiftKey ? "backward" : "forward",
    );
    focusable[nextIndex]?.focus();
  }

  return (
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      <div
        aria-hidden
        onMouseDown={() => dismiss("backdrop")}
        className="absolute inset-0 bg-[rgba(28,25,23,0.5)]"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="motion-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[78vh] w-full max-w-[440px] flex-col rounded-t-[26px] bg-white pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgba(28,25,23,0.4)]"
      >
        <div className="relative flex justify-center pt-3">
          <span className="h-1.5 w-10 rounded-full bg-[#e7dcca]" />
          <button
            type="button"
            aria-label={closeLabel}
            disabled={dismissDisabled}
            onClick={() => dismiss("close-button")}
            className="absolute right-4 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-tint text-xl leading-none text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2">{children}</div>
      </div>
    </div>
  );
}

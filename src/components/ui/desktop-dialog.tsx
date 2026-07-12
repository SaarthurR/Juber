"use client";

import { useEffect, useRef } from "react";
import {
  getFocusableElements,
  getInitialFocusTarget,
  nextFocusableIndex,
  shouldDismissLayer,
} from "@/lib/dialog-a11y";
import { useScrollLock } from "@/lib/use-scroll-lock";

export function DesktopDialog({
  open,
  onDismiss,
  dismissDisabled = false,
  labelledBy,
  closeLabel = "Close dialog",
  children,
  className = "",
  overlayClassName = "",
  backdropClassName = "bg-black/40",
}: {
  open: boolean;
  onDismiss: () => void;
  dismissDisabled?: boolean;
  labelledBy: string;
  closeLabel?: string;
  children?: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  backdropClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const panel = panelRef.current;
    if (panel) {
      window.requestAnimationFrame(() => getInitialFocusTarget(panel).focus());
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
      onDismiss();
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss("escape");
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = getFocusableElements(panelRef.current);
    event.preventDefault();
    if (focusable.length === 0) {
      panelRef.current.focus();
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
    <div
      className={`motion-overlay fixed inset-0 z-50 flex items-center justify-center p-4 ${overlayClassName}`}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss("backdrop");
      }}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 ${backdropClassName}`}
        onMouseDown={() => dismiss("backdrop")}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`motion-dialog relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label={closeLabel}
          disabled={dismissDisabled}
          onClick={() => dismiss("close-button")}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-stone-50 text-xl leading-none text-stone-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden="true">×</span>
        </button>
        {children}
      </div>
    </div>
  );
}

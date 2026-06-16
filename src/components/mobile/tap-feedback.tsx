"use client";

import { useEffect } from "react";

// iOS Safari only applies CSS `:active` styles while a finger is down if the
// document has a touch listener, and even then it lags behind the touch. That
// makes every tap feel dead/slow because the `active:scale-*` states on our
// buttons never fire until *after* navigation. This component drives an
// instant, reliable pressed state (`.is-pressed`) straight off `touchstart`,
// plus a short haptic buzz on devices that support it — so a press is confirmed
// the moment a finger lands, regardless of how long the action takes.
const TAP_SELECTOR = 'a, button, [role="button"], label, summary, input[type="submit"]';

export function TapFeedback() {
  useEffect(() => {
    let pressed: Element | null = null;

    const release = () => {
      if (pressed) {
        pressed.classList.remove("is-pressed");
        pressed = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = (e.target as Element | null)?.closest(TAP_SELECTOR);
      if (!target) return;
      if (target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true") {
        return;
      }
      release();
      pressed = target;
      target.classList.add("is-pressed");
      // Haptic confirmation where supported (Android Chrome). iOS ignores this.
      navigator.vibrate?.(8);
    };

    // passive: instant, never blocks scrolling.
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", release, { passive: true });
    document.addEventListener("touchcancel", release, { passive: true });
    // Releasing on scroll keeps the pressed state from sticking during a drag.
    document.addEventListener("scroll", release, { passive: true, capture: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", release);
      document.removeEventListener("touchcancel", release);
      document.removeEventListener("scroll", release, { capture: true } as EventListenerOptions);
    };
  }, []);

  return null;
}

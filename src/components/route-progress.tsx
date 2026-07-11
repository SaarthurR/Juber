"use client";

import { useEffect, useReducer, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ROUTE_PROGRESS_WATCHDOG_MS,
  createRouteProgressState,
  routeKey,
  routeProgressReducer,
  shouldTrackNavigation,
} from "@/lib/route-progress-model";

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(
    routeProgressReducer,
    undefined,
    createRouteProgressState,
  );
  const previousKey = useRef<string | null>(null);
  const currentKey = `${pathname}${searchParams.size ? `?${searchParams}` : ""}`;
  const active = state.status === "active" || state.status === "settling";

  useEffect(() => {
    previousKey.current = currentKey;
    dispatch({ type: "url", currentKey });
  }, [currentKey]);

  useEffect(() => {
    if (state.status !== "active") return undefined;
    const timeout = window.setTimeout(() => {
      dispatch({ type: "watchdog" });
    }, ROUTE_PROGRESS_WATCHDOG_MS);
    return () => window.clearTimeout(timeout);
  }, [state.status, state.targetKey]);

  useEffect(() => {
    if (state.status !== "settling") return undefined;
    const timeout = window.setTimeout(() => {
      dispatch({ type: "settled" });
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [state.status, state.targetKey]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      const decision = shouldTrackNavigation(
        {
          href: anchor.href,
          target: anchor.target,
          download: anchor.hasAttribute("download"),
        },
        event,
        new URL(window.location.href),
      );
      if (decision.track) {
        dispatch({ type: "start", targetKey: decision.targetKey });
      }
    }

    function onPopState() {
      dispatch({ type: "popstate" });
    }

    function reset() {
      dispatch({ type: "reset" });
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") reset();
    }

    document.addEventListener("click", onClick, { capture: true, passive: true });
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", reset);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pagehide", reset);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const previous = previousKey.current;
    if (!previous) return;
    if (state.status === "active" && state.targetKey && routeKey(new URL(window.location.href)) === previous) {
      dispatch({ type: "reset" });
    }
  }, [state.status, state.targetKey]);

  return (
    <>
      <span
        aria-hidden="true"
        className={`route-progress route-progress--${state.status}`}
        data-active={active ? "true" : "false"}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {state.status === "active"
          ? "Loading page"
          : state.status === "settling"
            ? "Page loaded"
            : ""}
      </span>
    </>
  );
}

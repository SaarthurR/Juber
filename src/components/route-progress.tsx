"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ROUTE_PROGRESS_WATCHDOG_MS,
  createRouteProgressState,
  routeProgressReducer,
} from "@/lib/route-progress-model";

type RouteProgressStart = (targetKey: string) => void;

const RouteProgressContext = createContext<RouteProgressStart | null>(null);

export function RouteProgress({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(
    routeProgressReducer,
    undefined,
    createRouteProgressState,
  );
  const currentKey = `${pathname}${searchParams.size ? `?${searchParams}` : ""}`;
  const active = state.status === "active" || state.status === "settling";
  const start = useCallback<RouteProgressStart>((targetKey) => {
    dispatch({ type: "start", targetKey });
  }, []);

  useEffect(() => {
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
    function onPopState() {
      dispatch({ type: "popstate" });
    }

    function reset() {
      dispatch({ type: "reset" });
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") reset();
    }

    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", reset);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pagehide", reset);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <RouteProgressContext.Provider value={start}>
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
      {children}
    </RouteProgressContext.Provider>
  );
}

export function useRouteProgressStart() {
  return useContext(RouteProgressContext);
}

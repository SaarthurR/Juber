export const ROUTE_PROGRESS_WATCHDOG_MS = 10_000;

export type AnchorLike = {
  href: string;
  target?: string | null;
  download?: boolean | string | null;
};

export type NavigationEventLike = {
  button: number;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export type RouteProgressNavigateEvent = {
  preventDefault: () => void;
};

export type RouteProgressState = {
  status: "idle" | "active" | "settling";
  targetKey: string | null;
};

export type RouteProgressAction =
  | { type: "start"; targetKey: string }
  | { type: "popstate" }
  | { type: "url"; currentKey: string }
  | { type: "settled" }
  | { type: "watchdog" }
  | { type: "reset" };

export function createRouteProgressState(): RouteProgressState {
  return {
    status: "idle",
    targetKey: null,
  };
}

export function routeProgressReducer(
  state: RouteProgressState,
  action: RouteProgressAction,
): RouteProgressState {
  switch (action.type) {
    case "start":
      return { status: "active", targetKey: action.targetKey };
    case "popstate":
      return { status: "active", targetKey: null };
    case "url":
      if (state.status !== "active") return state;
      if (state.targetKey === null || state.targetKey === action.currentKey) {
        return { status: "settling", targetKey: state.targetKey };
      }
      return state;
    case "settled":
    case "watchdog":
    case "reset":
      return createRouteProgressState();
  }
}

export function routeProgressVisualMode(reducedMotion: boolean): "scrub" | "opacity" {
  return reducedMotion ? "opacity" : "scrub";
}

export function routeKey(url: Pick<URL, "pathname" | "search">): string {
  return `${url.pathname}${url.search}`;
}

export function completeRouteProgressNavigation(
  {
    targetKey,
    onNavigate,
    start,
  }: {
    targetKey: string | null;
    onNavigate?: (event: RouteProgressNavigateEvent) => void;
    start: (targetKey: string) => void;
  },
  frameworkEvent: RouteProgressNavigateEvent,
): boolean {
  let canceled = false;
  onNavigate?.({
    preventDefault() {
      canceled = true;
      frameworkEvent.preventDefault();
    },
  });
  if (canceled || !targetKey) return false;
  start(targetKey);
  return true;
}

export function shouldTrackNavigation(
  anchor: AnchorLike,
  event: NavigationEventLike,
  currentUrl: URL,
): { track: true; targetKey: string } | { track: false; targetKey: null } {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return { track: false, targetKey: null };
  }
  if (anchor.download) return { track: false, targetKey: null };

  const target = anchor.target?.toLowerCase();
  if (target && target !== "_self") {
    return { track: false, targetKey: null };
  }

  const destination = new URL(anchor.href, currentUrl.href);
  if (destination.origin !== currentUrl.origin) {
    return { track: false, targetKey: null };
  }

  const currentKey = routeKey(currentUrl);
  const targetKey = routeKey(destination);
  if (targetKey === currentKey) {
    return { track: false, targetKey: null };
  }

  return { track: true, targetKey };
}

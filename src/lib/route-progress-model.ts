export const ROUTE_PROGRESS_WATCHDOG_MS = 10_000;
export const ROUTE_PROGRESS_UNPAIRED_URL_MS = 0;

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
  completedKey: string | null;
  pendingUrlKey: string | null;
  pendingUrlRevision: number;
};

export type RouteProgressAction =
  | { type: "start"; targetKey: string }
  | { type: "popstate"; currentKey: string }
  | { type: "url"; currentKey: string }
  | {
      type: "commit-unpaired-url";
      currentKey: string;
      revision: number;
    }
  | { type: "settled" }
  | { type: "watchdog" }
  | { type: "reset" };

export function createRouteProgressState(
  initialKey: string | null = null,
): RouteProgressState {
  return {
    status: "idle",
    targetKey: null,
    completedKey: initialKey,
    pendingUrlKey: null,
    pendingUrlRevision: 0,
  };
}

export function routeProgressReducer(
  state: RouteProgressState,
  action: RouteProgressAction,
): RouteProgressState {
  switch (action.type) {
    case "start":
      if (state.status === "active" && state.targetKey === action.targetKey) {
        return state;
      }
      return {
        ...state,
        status: "active",
        targetKey: action.targetKey,
        pendingUrlKey: null,
      };
    case "popstate":
      if (action.currentKey === state.completedKey) {
        return state.pendingUrlKey === null
          ? state
          : { ...state, pendingUrlKey: null };
      }
      if (action.currentKey === state.pendingUrlKey) {
        return {
          ...state,
          status: "settling",
          targetKey: action.currentKey,
          completedKey: action.currentKey,
          pendingUrlKey: null,
        };
      }
      if (
        state.status === "active"
        && state.targetKey === action.currentKey
      ) {
        return state;
      }
      return {
        ...state,
        status: "active",
        targetKey: action.currentKey,
        pendingUrlKey: null,
      };
    case "url":
      if (
        state.status === "active"
        && state.targetKey === action.currentKey
      ) {
        return {
          ...state,
          status: "settling",
          completedKey: action.currentKey,
          pendingUrlKey: null,
        };
      }
      if (state.status === "active") return state;
      if (action.currentKey === state.completedKey) {
        return state.pendingUrlKey === null
          ? state
          : { ...state, pendingUrlKey: null };
      }
      if (action.currentKey === state.pendingUrlKey) return state;
      return {
        ...state,
        pendingUrlKey: action.currentKey,
        pendingUrlRevision: state.pendingUrlRevision + 1,
      };
    case "commit-unpaired-url":
      if (
        action.currentKey !== state.pendingUrlKey
        || action.revision !== state.pendingUrlRevision
      ) {
        return state;
      }
      return {
        ...state,
        status: "idle",
        targetKey: null,
        completedKey: action.currentKey,
        pendingUrlKey: null,
      };
    case "settled":
      if (state.status === "idle" && state.targetKey === null) return state;
      return {
        ...state,
        status: "idle",
        targetKey: null,
      };
    case "watchdog":
    case "reset":
      if (
        state.status === "idle"
        && state.targetKey === null
        && state.pendingUrlKey === null
      ) {
        return state;
      }
      return {
        ...state,
        status: "idle",
        targetKey: null,
        completedKey: state.pendingUrlKey ?? state.completedKey,
        pendingUrlKey: null,
      };
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

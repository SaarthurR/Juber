export type RidesTab = "carpools" | "requests";

const RIDES_TABS: readonly RidesTab[] = ["carpools", "requests"];

const RIDES_TAB_RELATIONSHIPS = {
  carpools: {
    tabId: "rides-carpools-tab",
    panelId: "rides-carpools-panel",
  },
  requests: {
    tabId: "rides-requests-tab",
    panelId: "rides-requests-panel",
  },
} as const;

export type RidesTabState = {
  visibleTab: RidesTab;
};

export type RidesTabAction =
  | { type: "select"; tab: RidesTab }
  | { type: "sync"; search: string };

export function getRidesTabFromSearch(search: string): RidesTab {
  return new URLSearchParams(search).get("tab") === "requests" ? "requests" : "carpools";
}

export function createRidesTabHref(pathname: string, search: string, tab: RidesTab): string {
  const next = new URLSearchParams(search);
  if (tab === "requests") next.set("tab", "requests");
  else next.delete("tab");

  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function ridesTabReducer(
  state: RidesTabState,
  action: RidesTabAction,
): RidesTabState {
  const visibleTab =
    action.type === "select" ? action.tab : getRidesTabFromSearch(action.search);
  return state.visibleTab === visibleTab ? state : { visibleTab };
}

export function getRidesTabPresentation(activeTab: RidesTab) {
  return RIDES_TABS.map((key) => {
    const selected = key === activeTab;
    return {
      key,
      ...RIDES_TAB_RELATIONSHIPS[key],
      selected,
      tabIndex: selected ? 0 : -1,
      hidden: !selected,
    };
  });
}

export function activateRidesTabFromKey(
  currentTab: RidesTab,
  key: string,
  handlers: {
    activate: (tab: RidesTab) => void;
    focus: (tab: RidesTab) => void;
  },
) {
  const currentIndex = RIDES_TABS.indexOf(currentTab);
  let target: RidesTab | null = null;

  if (key === "ArrowLeft") {
    target = RIDES_TABS[(currentIndex - 1 + RIDES_TABS.length) % RIDES_TABS.length];
  } else if (key === "ArrowRight") {
    target = RIDES_TABS[(currentIndex + 1) % RIDES_TABS.length];
  } else if (key === "Home") {
    target = RIDES_TABS[0];
  } else if (key === "End") {
    target = RIDES_TABS[RIDES_TABS.length - 1];
  }

  if (!target) return false;
  handlers.focus(target);
  handlers.activate(target);
  return true;
}

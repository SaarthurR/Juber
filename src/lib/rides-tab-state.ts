export type RidesTab = "carpools" | "requests";

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

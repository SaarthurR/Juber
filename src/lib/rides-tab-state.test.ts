import test from "node:test";
import assert from "node:assert/strict";
import {
  activateRidesTabFromKey,
  commitRidesTabSelection,
  createRidesTabHref,
  getRidesTabPresentation,
  getRidesTabFromSearch,
  ridesTabReducer,
  syncRidesTabFromHistory,
  type RidesTab,
} from "./rides-tab-state";

function createHistoryController(
  initialTab: RidesTab,
  initialSearch = "?from=Fremont",
) {
  let currentTab = initialTab;
  let search = initialSearch;
  const commits: RidesTab[] = [];
  const history: Array<{
    state: { ridesTab: RidesTab };
    href: string;
  }> = [];

  return {
    get currentTab() {
      return currentTab;
    },
    commits,
    history,
    select(nextTab: RidesTab) {
      return commitRidesTabSelection({
        currentTab,
        nextTab,
        pathname: "/rides",
        search,
        commit: (tab) => {
          currentTab = tab;
          commits.push(tab);
        },
        pushState: (state, href) => {
          history.push({ state, href });
          search = href.includes("?") ? href.slice(href.indexOf("?")) : "";
        },
      });
    },
    back(nextSearch: string) {
      return syncRidesTabFromHistory(nextSearch, (tab) => {
        currentTab = tab;
        commits.push(tab);
      });
    },
  };
}

test("rides tab reducer changes visible tab immediately on click", () => {
  const state = ridesTabReducer(
    { visibleTab: "carpools" },
    { type: "select", tab: "requests" },
  );

  assert.deepEqual(state, { visibleTab: "requests" });
});

test("rides tab reducer syncs visible tab from browser history", () => {
  const state = ridesTabReducer(
    { visibleTab: "requests" },
    { type: "sync", search: "?from=Fremont" },
  );

  assert.deepEqual(state, { visibleTab: "carpools" });
});

test("rides tab URL helper writes canonical requests and carpools URLs", () => {
  assert.equal(
    createRidesTabHref("/rides", "?from=Fremont&tab=requests", "carpools"),
    "/rides?from=Fremont",
  );
  assert.equal(
    createRidesTabHref("/rides", "?from=Fremont", "requests"),
    "/rides?from=Fremont&tab=requests",
  );
});

test("rides tab parser treats only tab=requests as the requests panel", () => {
  assert.equal(getRidesTabFromSearch("?tab=requests"), "requests");
  assert.equal(getRidesTabFromSearch("?tab=carpools"), "carpools");
  assert.equal(getRidesTabFromSearch(""), "carpools");
});

test("rides tab presentation exposes stable roving-tab and panel relationships", () => {
  assert.deepEqual(getRidesTabPresentation("carpools"), [
    {
      key: "carpools",
      tabId: "rides-carpools-tab",
      panelId: "rides-carpools-panel",
      selected: true,
      tabIndex: 0,
      hidden: false,
    },
    {
      key: "requests",
      tabId: "rides-requests-tab",
      panelId: "rides-requests-panel",
      selected: false,
      tabIndex: -1,
      hidden: true,
    },
  ]);
});

test("ArrowLeft and ArrowRight wrap while activating and focusing the target tab", () => {
  const calls: string[] = [];

  assert.equal(
    activateRidesTabFromKey("carpools", "ArrowLeft", {
      activate: (tab) => calls.push(`activate:${tab}`),
      focus: (tab) => calls.push(`focus:${tab}`),
    }),
    true,
  );
  assert.deepEqual(calls, ["focus:requests", "activate:requests"]);

  calls.length = 0;
  assert.equal(
    activateRidesTabFromKey("requests", "ArrowRight", {
      activate: (tab) => calls.push(`activate:${tab}`),
      focus: (tab) => calls.push(`focus:${tab}`),
    }),
    true,
  );
  assert.deepEqual(calls, ["focus:carpools", "activate:carpools"]);
});

test("Home and End activate and focus the first and last tabs", () => {
  const calls: string[] = [];

  activateRidesTabFromKey("requests", "Home", {
    activate: (tab) => calls.push(`activate:${tab}`),
    focus: (tab) => calls.push(`focus:${tab}`),
  });
  activateRidesTabFromKey("carpools", "End", {
    activate: (tab) => calls.push(`activate:${tab}`),
    focus: (tab) => calls.push(`focus:${tab}`),
  });

  assert.deepEqual(calls, [
    "focus:carpools",
    "activate:carpools",
    "focus:requests",
    "activate:requests",
  ]);
});

test("unrelated keys leave tab selection and focus alone", () => {
  let called = false;
  const handled = activateRidesTabFromKey("carpools", "Enter", {
    activate: () => {
      called = true;
    },
    focus: () => {
      called = true;
    },
  });

  assert.equal(handled, false);
  assert.equal(called, false);
});

test("clicking the active tab preserves state without adding history", () => {
  const controller = createHistoryController("carpools");

  assert.equal(controller.select("carpools"), false);
  assert.equal(controller.currentTab, "carpools");
  assert.deepEqual(controller.commits, []);
  assert.deepEqual(controller.history, []);
});

test("Home and End on their active targets preserve focus without adding history", () => {
  const carpools = createHistoryController("carpools");
  const requests = createHistoryController("requests", "?from=Fremont&tab=requests");
  const focusCalls: RidesTab[] = [];

  activateRidesTabFromKey("carpools", "Home", {
    activate: carpools.select,
    focus: (tab) => focusCalls.push(tab),
  });
  activateRidesTabFromKey("requests", "End", {
    activate: requests.select,
    focus: (tab) => focusCalls.push(tab),
  });

  assert.deepEqual(focusCalls, ["carpools", "requests"]);
  assert.deepEqual(carpools.history, []);
  assert.deepEqual(requests.history, []);
});

test("an actual tab change commits once with filters preserved", () => {
  const controller = createHistoryController("carpools", "?from=Fremont&trip=round");

  assert.equal(controller.select("requests"), true);
  assert.equal(controller.currentTab, "requests");
  assert.deepEqual(controller.commits, ["requests"]);
  assert.deepEqual(controller.history, [
    {
      state: { ridesTab: "requests" },
      href: "/rides?from=Fremont&trip=round&tab=requests",
    },
  ]);
});

test("wrap arrows focus and commit only their actual tab changes", () => {
  const controller = createHistoryController("carpools");
  const focusCalls: RidesTab[] = [];

  activateRidesTabFromKey("carpools", "ArrowLeft", {
    activate: controller.select,
    focus: (tab) => focusCalls.push(tab),
  });
  activateRidesTabFromKey("requests", "ArrowRight", {
    activate: controller.select,
    focus: (tab) => focusCalls.push(tab),
  });

  assert.deepEqual(focusCalls, ["requests", "carpools"]);
  assert.deepEqual(controller.history, [
    {
      state: { ridesTab: "requests" },
      href: "/rides?from=Fremont&tab=requests",
    },
    {
      state: { ridesTab: "carpools" },
      href: "/rides?from=Fremont",
    },
  ]);
});

test("Back synchronizes the visible tab without writing replacement history", () => {
  const controller = createHistoryController("carpools");
  controller.select("requests");

  assert.equal(controller.back("?from=Fremont"), "carpools");
  assert.equal(controller.currentTab, "carpools");
  assert.deepEqual(controller.commits, ["requests", "carpools"]);
  assert.equal(controller.history.length, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  activateRidesTabFromKey,
  createRidesTabHref,
  getRidesTabPresentation,
  getRidesTabFromSearch,
  ridesTabReducer,
} from "./rides-tab-state";

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

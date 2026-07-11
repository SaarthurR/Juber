import test from "node:test";
import assert from "node:assert/strict";
import {
  ROUTE_PROGRESS_WATCHDOG_MS,
  createRouteProgressState,
  routeProgressReducer,
  routeProgressVisualMode,
  shouldTrackNavigation,
  type AnchorLike,
  type NavigationEventLike,
} from "./route-progress-model";

const current = new URL("https://juber.test/rides?tab=requests");

function anchor(overrides: Partial<AnchorLike> = {}): AnchorLike {
  return {
    href: "https://juber.test/events",
    target: "",
    download: false,
    ...overrides,
  };
}

function event(overrides: Partial<NavigationEventLike> = {}): NavigationEventLike {
  return {
    button: 0,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

test("navigation predicate tracks only same-origin route changes", () => {
  assert.deepEqual(shouldTrackNavigation(anchor(), event(), current), {
    track: true,
    targetKey: "/events",
  });
  assert.deepEqual(
    shouldTrackNavigation(anchor({ href: "https://juber.test/rides?page=2" }), event(), current),
    { track: true, targetKey: "/rides?page=2" },
  );

  for (const [label, link, click] of [
    ["external", anchor({ href: "https://evil.test/events" }), event()],
    ["download", anchor({ download: true }), event()],
    ["blank", anchor({ target: "_blank" }), event()],
    ["top", anchor({ target: "_top" }), event()],
    ["default prevented", anchor(), event({ defaultPrevented: true })],
    ["middle click", anchor(), event({ button: 1 })],
    ["meta click", anchor(), event({ metaKey: true })],
    ["ctrl click", anchor(), event({ ctrlKey: true })],
    ["shift click", anchor(), event({ shiftKey: true })],
    ["alt click", anchor(), event({ altKey: true })],
    ["same url", anchor({ href: "https://juber.test/rides?tab=requests" }), event()],
    ["hash only", anchor({ href: "https://juber.test/rides?tab=requests#top" }), event()],
  ] as const) {
    assert.deepEqual(
      shouldTrackNavigation(link, click, current),
      { track: false, targetKey: null },
      label,
    );
  }
});

test("route progress state completes by target URL, supersedes, and resets", () => {
  let state = createRouteProgressState();

  state = routeProgressReducer(state, { type: "start", targetKey: "/events" });
  assert.equal(state.status, "active");
  assert.equal(state.targetKey, "/events");

  state = routeProgressReducer(state, { type: "start", targetKey: "/messages" });
  assert.equal(state.status, "active");
  assert.equal(state.targetKey, "/messages");

  state = routeProgressReducer(state, { type: "url", currentKey: "/events" });
  assert.equal(state.status, "active");
  assert.equal(state.targetKey, "/messages");

  state = routeProgressReducer(state, { type: "url", currentKey: "/messages" });
  assert.equal(state.status, "settling");
  assert.equal(state.targetKey, "/messages");

  state = routeProgressReducer(state, { type: "settled" });
  assert.deepEqual(state, createRouteProgressState());

  state = routeProgressReducer(state, { type: "popstate" });
  assert.equal(state.status, "active");
  assert.equal(state.targetKey, null);
  state = routeProgressReducer(state, { type: "url", currentKey: "/profile" });
  assert.equal(state.status, "settling");
  state = routeProgressReducer(state, { type: "watchdog" });
  assert.deepEqual(state, createRouteProgressState());
});

test("watchdog and reduced-motion contracts are explicit", () => {
  assert.equal(ROUTE_PROGRESS_WATCHDOG_MS, 10_000);
  assert.equal(routeProgressVisualMode(false), "scrub");
  assert.equal(routeProgressVisualMode(true), "opacity");
});

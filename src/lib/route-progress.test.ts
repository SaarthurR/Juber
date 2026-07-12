import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ROUTE_PROGRESS_WATCHDOG_MS,
  createRouteProgressState,
  routeProgressReducer,
  routeProgressVisualMode,
  shouldTrackNavigation,
  type AnchorLike,
  type NavigationEventLike,
} from "./route-progress-model";

type RouteProgressModelRuntime = {
  completeRouteProgressNavigation?: (
    input: {
      targetKey: string | null;
      onNavigate?: (event: { preventDefault: () => void }) => void;
      start: (targetKey: string) => void;
    },
    frameworkEvent: { preventDefault: () => void },
  ) => boolean;
};

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
    ["parent", anchor({ target: "_parent" }), event()],
    ["named target", anchor({ target: "details" }), event()],
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

test("supported Link navigation starts only after application cancellation checks", async () => {
  const model = await import("./route-progress-model") as RouteProgressModelRuntime;
  const completeNavigation = model.completeRouteProgressNavigation;
  assert.equal(
    typeof completeNavigation,
    "function",
    "production navigation completion helper must exist",
  );
  if (!completeNavigation) return;

  const starts: string[] = [];
  let frameworkCancellations = 0;
  const frameworkEvent = {
    preventDefault() {
      frameworkCancellations += 1;
    },
  };

  const canceled = completeNavigation(
    {
      targetKey: "/events",
      onNavigate(event) {
        event.preventDefault();
      },
      start(targetKey) {
        starts.push(targetKey);
      },
    },
    frameworkEvent,
  );
  const navigated = completeNavigation(
    {
      targetKey: "/messages",
      start(targetKey) {
        starts.push(targetKey);
      },
    },
    frameworkEvent,
  );

  assert.equal(canceled, false);
  assert.equal(navigated, true);
  assert.equal(frameworkCancellations, 1);
  assert.deepEqual(starts, ["/messages"]);
});

test("RouteProgress integrates through Next Link onNavigate, not document capture", () => {
  const componentRoot = new URL("../components/", import.meta.url);
  const trackedLinkPath = fileURLToPath(
    new URL("route-progress-link.tsx", componentRoot),
  );
  assert.equal(
    existsSync(trackedLinkPath),
    true,
    "tracked Link integration must exist",
  );
  if (!existsSync(trackedLinkPath)) return;

  const trackedLink = readFileSync(trackedLinkPath, "utf8");
  const progress = readFileSync(
    fileURLToPath(new URL("route-progress.tsx", componentRoot)),
    "utf8",
  );
  const authGate = readFileSync(
    fileURLToPath(new URL("landing-auth-gate.tsx", componentRoot)),
    "utf8",
  );
  const nextLink = readFileSync(
    fileURLToPath(
      new URL("../../node_modules/next/dist/client/app-dir/link.js", import.meta.url),
    ),
    "utf8",
  );

  assert.match(trackedLink, /onNavigate=\{handleNavigate\}/);
  assert.match(trackedLink, /completeRouteProgressNavigation/);
  assert.doesNotMatch(progress, /document\.addEventListener\("click"/);
  assert.match(authGate, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\)/);

  const linkClickHandler = nextLink.indexOf("onClick (e)");
  const customClickGuard = nextLink.indexOf("if (e.defaultPrevented)", linkClickHandler);
  const linkClickedCall = nextLink.indexOf("linkClicked(", customClickGuard);
  const linkClickedDefinition = nextLink.indexOf("function linkClicked");
  const frameworkPreventDefault = nextLink.indexOf(
    "e.preventDefault();",
    linkClickedDefinition,
  );
  const onNavigate = nextLink.indexOf("if (onNavigate)", frameworkPreventDefault);
  const routerDispatch = nextLink.indexOf("dispatchNavigateAction", onNavigate);
  assert.ok(linkClickHandler >= 0);
  assert.ok(customClickGuard > linkClickHandler);
  assert.ok(linkClickedCall > customClickGuard);
  assert.ok(frameworkPreventDefault > linkClickedDefinition);
  assert.ok(onNavigate > frameworkPreventDefault);
  assert.ok(routerDispatch > onNavigate);
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

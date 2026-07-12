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
  assert.match(
    progress,
    /function onPopState\(\)[\s\S]*routeKey\(new URL\(window\.location\.href\)\)[\s\S]*type: "popstate", currentKey/,
  );
  assert.match(
    progress,
    /state\.pendingUrlKey[\s\S]*setTimeout[\s\S]*type: "commit-unpaired-url"/,
  );
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

test("hash-only events stay idle in pop→url and url→pop order", () => {
  const initial = createRouteProgressState("/rides?tab=requests");
  const popThenUrl = routeProgressReducer(
    routeProgressReducer(initial, {
      type: "popstate",
      currentKey: "/rides?tab=requests",
    }),
    {
      type: "url",
      currentKey: "/rides?tab=requests",
    },
  );
  const urlThenPop = routeProgressReducer(
    routeProgressReducer(initial, {
      type: "url",
      currentKey: "/rides?tab=requests",
    }),
    {
      type: "popstate",
      currentKey: "/rides?tab=requests",
    },
  );

  assert.equal(initial.pendingUrlKey, null);
  assert.strictEqual(popThenUrl, initial);
  assert.strictEqual(urlThenPop, initial);
  assert.equal(urlThenPop.status, "idle");
});

test("pop→url history starts then settles exactly once", () => {
  const initial = createRouteProgressState("/rides?tab=requests");
  const started = routeProgressReducer(initial, {
    type: "popstate",
    currentKey: "/events",
  });
  const duplicate = routeProgressReducer(started, {
    type: "popstate",
    currentKey: "/events",
  });
  const completed = routeProgressReducer(duplicate, {
    type: "url",
    currentKey: "/events",
  });
  const postCompletionDuplicate = routeProgressReducer(completed, {
    type: "popstate",
    currentKey: "/events",
  });

  assert.equal(started.status, "active");
  assert.equal(started.targetKey, "/events");
  assert.strictEqual(duplicate, started);
  assert.equal(completed.status, "settling");
  assert.equal(completed.completedKey, "/events");
  assert.equal(completed.pendingUrlKey, null);
  assert.strictEqual(postCompletionDuplicate, completed);
});

test("url→pop history pairs the pending URL and settles exactly once", () => {
  const initial = createRouteProgressState("/rides?tab=requests");
  const pending = routeProgressReducer(initial, {
    type: "url",
    currentKey: "/events?page=2",
  });
  const duplicateUrl = routeProgressReducer(pending, {
    type: "url",
    currentKey: "/events?page=2",
  });
  const paired = routeProgressReducer(duplicateUrl, {
    type: "popstate",
    currentKey: "/events?page=2",
  });
  const staleExpiry = routeProgressReducer(paired, {
    type: "commit-unpaired-url",
    currentKey: "/events?page=2",
    revision: pending.pendingUrlRevision,
  });
  const duplicatePop = routeProgressReducer(staleExpiry, {
    type: "popstate",
    currentKey: "/events?page=2",
  });

  assert.equal(pending.status, "idle");
  assert.equal(pending.completedKey, "/rides?tab=requests");
  assert.equal(pending.pendingUrlKey, "/events?page=2");
  assert.ok(pending.pendingUrlRevision > initial.pendingUrlRevision);
  assert.strictEqual(duplicateUrl, pending);
  assert.equal(paired.status, "settling");
  assert.equal(paired.targetKey, "/events?page=2");
  assert.equal(paired.completedKey, "/events?page=2");
  assert.equal(paired.pendingUrlKey, null);
  assert.strictEqual(staleExpiry, paired);
  assert.strictEqual(duplicatePop, paired);
});

test("unpaired imperative URL commits quietly when its pending window expires", () => {
  const initial = createRouteProgressState("/rides");
  const pending = routeProgressReducer(initial, {
    type: "url",
    currentKey: "/profile",
  });
  const staleCommit = routeProgressReducer(pending, {
    type: "commit-unpaired-url",
    currentKey: "/profile",
    revision: pending.pendingUrlRevision - 1,
  });
  const committed = routeProgressReducer(staleCommit, {
    type: "commit-unpaired-url",
    currentKey: "/profile",
    revision: pending.pendingUrlRevision,
  });
  const duplicatePop = routeProgressReducer(committed, {
    type: "popstate",
    currentKey: "/profile",
  });

  assert.equal(pending.status, "idle");
  assert.strictEqual(staleCommit, pending);
  assert.equal(committed.status, "idle");
  assert.equal(committed.completedKey, "/profile");
  assert.equal(committed.pendingUrlKey, null);
  assert.strictEqual(duplicatePop, committed);
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
  assert.deepEqual(state, createRouteProgressState("/messages"));

  state = routeProgressReducer(state, { type: "start", targetKey: "/profile" });
  state = routeProgressReducer(state, { type: "watchdog" });
  assert.deepEqual(state, createRouteProgressState("/messages"));

  state = routeProgressReducer(state, { type: "start", targetKey: "/events" });
  state = routeProgressReducer(state, { type: "reset" });
  assert.deepEqual(state, createRouteProgressState("/messages"));
});

test("watchdog and reduced-motion contracts are explicit", () => {
  assert.equal(ROUTE_PROGRESS_WATCHDOG_MS, 10_000);
  assert.equal(routeProgressVisualMode(false), "scrub");
  assert.equal(routeProgressVisualMode(true), "opacity");
});

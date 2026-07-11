import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AUTH_CALLBACK_TARGETS,
  MESSAGE_BASE_TARGETS,
  RIDE_LIST_TARGETS,
  pickAllowed,
  requestListDestination,
  requestRevalidationTargets,
  rideDetailDestination,
} from "./route-targets";

test("pickAllowed returns fallback for disallowed values", () => {
  const allowed = ["/events"] as const;
  const fallback = "/rides";

  assert.equal(pickAllowed("//evil", allowed, fallback), fallback);
  assert.equal(pickAllowed("/admin", allowed, fallback), fallback);
  assert.equal(pickAllowed("/rides", allowed, fallback), fallback);
});

test("pickAllowed keeps an allow-listed value", () => {
  const allowed = ["/events"] as const;

  assert.equal(pickAllowed("/events", allowed, "/rides"), "/events");
});

test("message bases include mobile and reject unsafe returns", () => {
  assert.equal(pickAllowed("/m/messages", MESSAGE_BASE_TARGETS, "/messages"), "/m/messages");
  assert.equal(pickAllowed("//evil.test/messages", MESSAGE_BASE_TARGETS, "/messages"), "/messages");
  assert.equal(pickAllowed("/m/messages/abc", MESSAGE_BASE_TARGETS, "/messages"), "/messages");
});

test("ride list bases include mobile and reject unsafe returns", () => {
  assert.equal(pickAllowed("/m", RIDE_LIST_TARGETS, "/rides"), "/m");
  assert.equal(pickAllowed("/m/rides", RIDE_LIST_TARGETS, "/rides"), "/rides");
  assert.equal(pickAllowed("/admin", RIDE_LIST_TARGETS, "/rides"), "/rides");
  assert.equal(pickAllowed("https://evil.test/rides", RIDE_LIST_TARGETS, "/rides"), "/rides");
});

test("every allow-listed base has an app page", () => {
  const targets = [
    ...AUTH_CALLBACK_TARGETS,
    ...MESSAGE_BASE_TARGETS,
    ...RIDE_LIST_TARGETS,
  ];

  for (const target of targets) {
    const page = fileURLToPath(new URL(`../app${target}/page.tsx`, import.meta.url));
    assert.equal(existsSync(page), true, `${target} must resolve to an app page`);
  }
});

test("request actions revalidate desktop and mobile list and detail routes", () => {
  assert.deepEqual(requestRevalidationTargets("request-123"), [
    "/rides",
    "/requests",
    "/m",
    "/m/requests",
    "/requests/request-123",
    "/m/requests/request-123",
  ]);
});

test("request cancellation returns only to existing list pages", () => {
  assert.equal(requestListDestination("/rides"), "/rides?tab=requests");
  assert.equal(requestListDestination("/m"), "/m");
  assert.equal(requestListDestination("/m/rides"), "/rides?tab=requests");
});

test("seat cancellation returns to an existing ride detail page", () => {
  assert.equal(rideDetailDestination("/rides", "ride-123"), "/rides/ride-123");
  assert.equal(rideDetailDestination("/m", "ride-123"), "/m/rides/ride-123");
  assert.equal(rideDetailDestination("/m/rides", "ride-123"), "/rides/ride-123");
});

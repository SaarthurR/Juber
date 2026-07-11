import test from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_BASE_TARGETS,
  RIDE_LIST_TARGETS,
  pickAllowed,
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
  assert.equal(pickAllowed("/m/rides", RIDE_LIST_TARGETS, "/rides"), "/m/rides");
  assert.equal(pickAllowed("/admin", RIDE_LIST_TARGETS, "/rides"), "/rides");
  assert.equal(pickAllowed("https://evil.test/rides", RIDE_LIST_TARGETS, "/rides"), "/rides");
});

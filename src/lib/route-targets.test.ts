import test from "node:test";
import assert from "node:assert/strict";
import { pickAllowed } from "./route-targets";

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

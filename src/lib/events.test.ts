import test from "node:test";
import assert from "node:assert/strict";
import { formatEventDateRange } from "./events";

test("formatEventDateRange keeps date-only labels stable in UTC-7", () => {
  assert.equal(formatEventDateRange("2026-07-10", null), "July 10, 2026");
});

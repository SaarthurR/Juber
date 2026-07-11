import test from "node:test";
import assert from "node:assert/strict";
import { dateOnlyToIso, formatRideDateTime } from "./date-time";

test("dateOnlyToIso keeps the literal request date at noon", () => {
  assert.equal(dateOnlyToIso("2026-08-09"), "2026-08-09T19:00:00.000Z");
});

test("dateOnlyToIso keeps the literal request date at midnight", () => {
  assert.equal(dateOnlyToIso("2026-08-09", "00:00"), "2026-08-09T07:00:00.000Z");
});

test("dateOnlyToIso rejects invalid date-only values", () => {
  assert.throws(() => dateOnlyToIso("2026-13-09"), /valid date/);
  assert.throws(() => dateOnlyToIso("08/09/2026"), /valid date/);
});

test("formatRideDateTime displays UTC-shaped wall times without day drift", () => {
  assert.equal(formatRideDateTime("2026-08-09T00:30:00.000Z", "yyyy-MM-dd HH:mm"), "2026-08-09 00:30");
});

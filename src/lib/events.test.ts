import test from "node:test";
import assert from "node:assert/strict";
import {
  eventStatsAreEmpty,
  filterPublicUpcomingEvents,
  formatEventDateRange,
  summarizePublicRideCounts,
} from "./events";

test("formatEventDateRange keeps date-only labels stable in UTC-7", () => {
  assert.equal(formatEventDateRange("2026-07-10", null), "July 10, 2026");
});

test("filterPublicUpcomingEvents keeps only active non-past events", () => {
  const events = [
    { id: "future", is_active: true, start_date: "2026-07-12", end_date: null },
    { id: "range", is_active: true, start_date: "2026-07-01", end_date: "2026-07-11" },
    { id: "past", is_active: true, start_date: "2026-07-01", end_date: "2026-07-10" },
    { id: "inactive", is_active: false, start_date: "2026-07-12", end_date: null },
    { id: "undated", is_active: true, start_date: null, end_date: null },
  ];

  assert.deepEqual(
    filterPublicUpcomingEvents(events, "2026-07-11").map((event) => event.id),
    ["future", "range"],
  );
});

test("summarizePublicRideCounts counts only ride feed fields", () => {
  const stats = summarizePublicRideCounts([
    { event_id: "event-1", seats_available: 3 },
    { event_id: "event-1", seats_available: 0 },
    { event_id: "event-2", seats_available: 2 },
    { event_id: null, seats_available: 9 },
  ]);

  assert.deepEqual(stats.get("event-1"), { rides: 2, seats: 3 });
  assert.deepEqual(stats.get("event-2"), { rides: 1, seats: 2 });
  assert.equal(stats.has("missing"), false);
});

test("eventStatsAreEmpty distinguishes first-mover cards from active boards", () => {
  assert.equal(eventStatsAreEmpty({ rides: 0, seats: 0, requests: 0 }), true);
  assert.equal(eventStatsAreEmpty({ rides: 0, seats: 0, requests: null }), true);
  assert.equal(eventStatsAreEmpty({ rides: 1, seats: 0, requests: null }), false);
});

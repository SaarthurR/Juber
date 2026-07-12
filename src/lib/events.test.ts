import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

test("signed-out loadEventBoard uses event-scoped public_event_rides RPC", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./events.ts", import.meta.url)),
    "utf8",
  );
  const loadEventBoardStart = source.indexOf("export async function loadEventBoard");
  const signedOutBranch = source.slice(
    loadEventBoardStart,
    source.indexOf("if (!signedIn)", loadEventBoardStart) + 700,
  );

  assert.match(signedOutBranch, /public_event_board/);
  assert.match(signedOutBranch, /public_event_rides/);
  assert.doesNotMatch(signedOutBranch, /public_upcoming_rides/);
});

test("signed-out event loaders preserve public source URLs", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./events.ts", import.meta.url)),
    "utf8",
  );

  assert.match(source, /source_url:\s*event\.source_url/);
  assert.doesNotMatch(source, /source_url:\s*null/);
});

test("desktop and mobile event board headers share the safe source link", () => {
  for (const path of [
    "../app/(desktop)/events/[slug]/page.tsx",
    "../app/m/events/[slug]/page.tsx",
  ]) {
    const page = readFileSync(
      fileURLToPath(new URL(path, import.meta.url)),
      "utf8",
    );
    assert.match(page, /import \{ EventSourceLink \}/);
    assert.match(page, /event\.source_url[\s\S]*<EventSourceLink/);
    assert.doesNotMatch(
      page,
      /(redirect|router\.push)\s*\([^)]*source_url/,
    );
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState, DEMO_IDS } from "@/lib/demo/fixtures";
import {
  demoActiveRequests,
  demoEventBoard,
  demoEventSummaries,
  demoEvents,
  demoRequest,
} from "@/lib/demo-page-data";

test("demo page data is linked, date-safe, and external-free", () => {
  const state = createDemoState("2026-07-13");
  state.events[DEMO_IDS.events.shabbat].source_url = "https://example.com/event";

  const events = demoEvents(state);
  assert.equal(events[0].start_date, "2026-07-18");
  assert.equal(events[0].source_url, null);

  const board = demoEventBoard(state, "community-shabbat-dinner");
  assert.ok(board);
  assert.equal(board.event.source_url, null);
  assert.equal(board.rides.length, 1);
  assert.equal(demoEventSummaries(state)[0].stats.rides, 1);

  const requests = demoActiveRequests(state);
  assert.ok(requests.every((request) => request.latest_date?.length === 10));
  assert.equal(
    demoRequest(state, DEMO_IDS.requests.fulfilled)?.accepted_driver?.id,
    DEMO_IDS.profiles.admin,
  );
});

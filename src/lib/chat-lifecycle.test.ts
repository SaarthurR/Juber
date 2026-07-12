import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  lifecycleRefreshTarget,
  seatCancelRefreshTarget,
} from "./messages";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/20260712150000_chat_lifecycle_realtime.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const messageThread = readFileSync(
  fileURLToPath(new URL("../components/message-thread.tsx", import.meta.url)),
  "utf8",
);
const messagesList = readFileSync(
  fileURLToPath(new URL("../components/messages-list.tsx", import.meta.url)),
  "utf8",
);
const desktopThreadPage = readFileSync(
  fileURLToPath(new URL("../app/(desktop)/messages/[id]/page.tsx", import.meta.url)),
  "utf8",
);
const mobileThreadPage = readFileSync(
  fileURLToPath(new URL("../app/m/messages/[id]/page.tsx", import.meta.url)),
  "utf8",
);

test("migration adds ride_passengers to realtime idempotently with lifecycle guards", () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.ride_passengers/i);
  assert.match(migration, /when duplicate_object then null/i);
  assert.match(migration, /pg_publication_tables[\s\S]*tablename in \('rides', 'ride_requests', 'ride_passengers'\)/i);
  assert.match(migration, /passengers_select/i);
  assert.match(migration, /ban_lockout/i);
  assert.match(migration, /ride_passenger_pickup_notes/i);
  assert.match(migration, /soft hide removes inbox visibility/i);
  assert.match(migration, /redact-not-delete requires explicit product approval/i);
});

test("migration preserves anon revoke and private side-table exclusion", () => {
  assert.match(migration, /revoke all on table public\.ride_passengers from anon/i);
  assert.match(migration, /anon must not retain SELECT on ride_passengers/i);
  assert.match(migration, /private tables must remain outside realtime publication/i);
  assert.doesNotMatch(migration, /ride_passenger_pickup_notes[\s\S]*add table/i);
});

test("seat cancel refresh target scopes to ride context ride_id only", () => {
  assert.deepEqual(seatCancelRefreshTarget("ride", "ride-abc"), {
    table: "ride_passengers",
    filter: "ride_id=eq.ride-abc",
  });
  assert.equal(seatCancelRefreshTarget("request", "request-1"), null);
  assert.equal(seatCancelRefreshTarget("missing", "missing-1"), null);
});

test("lifecycle refresh keeps rides and ride_requests separate from seat cancel", () => {
  assert.deepEqual(lifecycleRefreshTarget("ride", "ride-abc"), {
    table: "rides",
    filter: "id=eq.ride-abc",
  });
  assert.deepEqual(seatCancelRefreshTarget("ride", "ride-abc"), {
    table: "ride_passengers",
    filter: "ride_id=eq.ride-abc",
  });
});

test("message thread subscribes to scoped ride_passengers UPDATE for seat cancel", () => {
  assert.match(messageThread, /seatCancelRefreshTarget/);
  assert.match(messageThread, /table: seatCancelTarget\.table/);
  assert.match(messageThread, /filter: seatCancelTarget\.filter/);
  assert.match(messageThread, /event: "UPDATE"/);
  assert.match(messageThread, /lifecycleRefreshTarget/);
  assert.match(messageThread, /visibilitychange/);
  assert.match(messageThread, /archiveRefreshDelay/);
});

test("inbox does not subscribe to ride_passengers lifecycle fan-out", () => {
  assert.doesNotMatch(messagesList, /ride_passengers/);
  assert.match(messagesList, /conversation_participants/);
  assert.match(messagesList, /visibilitychange/);
});

test("desktop and mobile thread pages share MessageThread lifecycle wiring", () => {
  for (const source of [desktopThreadPage, mobileThreadPage]) {
    assert.match(source, /MessageThread/);
    assert.match(source, /contextKind/);
    assert.match(source, /contextId/);
  }
});

test("unrelated ride seat cancel filter cannot match a different thread ride", () => {
  const thisRide = seatCancelRefreshTarget("ride", "ride-this");
  const otherRide = seatCancelRefreshTarget("ride", "ride-other");
  assert.notEqual(thisRide?.filter, otherRide?.filter);
  assert.match(thisRide!.filter, /ride_id=eq\.ride-this/);
  assert.match(otherRide!.filter, /ride_id=eq\.ride-other/);
});

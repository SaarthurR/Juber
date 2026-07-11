import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const desktopRidePage = readFileSync(
  new URL("../app/(desktop)/rides/[id]/page.tsx", import.meta.url),
  "utf8",
);
const mobileRidePage = readFileSync(
  new URL("../app/m/rides/[id]/page.tsx", import.meta.url),
  "utf8",
);
const rideActions = readFileSync(
  new URL("../app/rides/actions.ts", import.meta.url),
  "utf8",
);

test("desktop makes declined and cancelled seat requests reachable", () => {
  assert.match(
    desktopRidePage,
    /canReserveRide\(\s*ride\.status,\s*myJoin\?\.status,\s*ride\.seats_available\s*\)/,
  );
  assert.match(desktopRidePage, /Request a seat again/);
});

test("mobile makes declined and cancelled seat requests reachable", () => {
  assert.match(
    mobileRidePage,
    /canReserveRide\(\s*ride\.status,\s*myJoin\?\.status,\s*ride\.seats_available\s*\)/,
  );
  assert.match(mobileRidePage, /Request a seat again/);
});

test("desktop and mobile hide passenger decisions on terminal rides", () => {
  for (const source of [desktopRidePage, mobileRidePage]) {
    const buttonIndex = source.indexOf("<PassengerStatusButtons");
    assert.notEqual(buttonIndex, -1);
    assert.match(source.slice(Math.max(0, buttonIndex - 180), buttonIndex), /ride\.status === "active"/);
  }
});

test("passenger status action rejects terminal rides before either decision", () => {
  assert.match(rideActions, /\.select\("driver_id,status"\)/);
  assert.match(rideActions, /ride\.status !== "active"/);
});

test("empty-reason cancellation atomically requires a fresh empty roster", () => {
  assert.match(rideActions, /\.eq\("seats_available", ride\.seats_total\)/);
  assert.match(rideActions, /Please tell your riders why the ride is cancelled\./);
});

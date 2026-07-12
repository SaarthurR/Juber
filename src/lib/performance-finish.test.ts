import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSrc(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

function indexAfter(source: string, needle: string, from = 0) {
  const index = source.indexOf(needle, from);
  assert.notEqual(index, -1, `missing: ${needle}`);
  return index;
}

const desktopRide = readSrc("../app/(desktop)/rides/[id]/page.tsx");
const mobileRide = readSrc("../app/m/rides/[id]/page.tsx");
const events = readSrc("./events.ts");
const desktopLayout = readSrc("../app/(desktop)/layout.tsx");
const rootLayout = readSrc("../app/layout.tsx");

test("ride detail pages parallelize ride and passenger reads", () => {
  for (const source of [desktopRide, mobileRide]) {
    const rideAll = indexAfter(source, "await Promise.all([");
    assert.match(source.slice(rideAll, rideAll + 500), /\.from\("rides"\)/);
    assert.match(source.slice(rideAll, rideAll + 700), /\.from\("ride_passengers"\)/);
    assert.match(source.slice(rideAll, rideAll + 900), /throwReadError\(rideError/);
    assert.match(source.slice(rideAll, rideAll + 900), /notFound\(\)/);
    assert.match(source.slice(rideAll, rideAll + 900), /throwReadError\(passengersError/);
  }
});

test("ride detail pages parallelize gated meetup and home before contact lookup", () => {
  for (const source of [desktopRide, mobileRide]) {
    const meetupPromise = indexAfter(source, "const meetupPromise");
    const homePromise = indexAfter(source, "const homePromise", meetupPromise);
    const meetupAll = indexAfter(source, "const [meetupRows, savedHome] = await Promise.all", homePromise);
    const contact = indexAfter(source, "getContact(supabase", meetupAll);
    assert.ok(meetupPromise < homePromise);
    assert.ok(homePromise < meetupAll);
    assert.ok(meetupAll < contact);
    assert.match(source, /user && !isDriver && ride\.status === "active" && myJoin\?\.status === "confirmed"/);
  }
});

test("signed-in loadEventBoard parallelizes rides and requests after event resolves", () => {
  const fn = indexAfter(events, "export async function loadEventBoard");
  const signedOutEnd = indexAfter(events, "publicOnly: true,", fn);
  const signedIn = events.slice(signedOutEnd);
  const eventQuery = indexAfter(signedIn, '.from("events")');
  const parallel = indexAfter(signedIn, "await Promise.all([", eventQuery);
  const block = signedIn.slice(parallel, parallel + 900);
  assert.match(block, /\.from\("rides"\)/);
  assert.match(block, /\.from\("ride_requests"\)/);
  assert.doesNotMatch(signedIn.slice(0, eventQuery), /Promise\.all\(\[[\s\S]*ride_requests/);
});

test("signed-out loadEventBoard keeps serial public RPC path", () => {
  const fn = indexAfter(events, "export async function loadEventBoard");
  const signedOut = events.slice(fn, indexAfter(events, "if (!signedIn)", fn) + 800);
  assert.match(signedOut, /public_event_board/);
  assert.match(signedOut, /public_event_rides/);
  assert.doesNotMatch(signedOut, /Promise\.all/);
});

test("desktop layout parallelizes profile and notifications only after ban gate", () => {
  const layoutStart = indexAfter(desktopLayout, "export default async function DesktopLayout");
  const layoutBody = desktopLayout.slice(layoutStart);
  const moderation = indexAfter(layoutBody, "loadModerationSnapshot");
  const banned = indexAfter(layoutBody, "const banned", moderation);
  const parallel = indexAfter(layoutBody, "await Promise.all([", banned);
  assert.match(
    layoutBody.slice(parallel, parallel + 400),
    /profiles[\s\S]*loadDesktopNotificationSnapshot/,
  );
  assert.match(layoutBody, /if \(user && !banned\)/);
  assert.doesNotMatch(layoutBody.slice(moderation, parallel), /loadDesktopNotificationSnapshot\(/);
});

test("root layout keeps moderation ban gate serial and authoritative", () => {
  assert.match(rootLayout, /loadModerationSnapshot/);
  assert.doesNotMatch(rootLayout, /Promise\.all/);
  assert.doesNotMatch(rootLayout, /hasContact/);
  const moderation = indexAfter(rootLayout, "loadModerationSnapshot");
  const gate = indexAfter(rootLayout, "ModerationBannedGate", moderation);
  assert.ok(gate > moderation);
});

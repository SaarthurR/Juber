import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  confirmedSeatTotal,
  maxGuestCount,
  parseGuestCount,
  parsePickupSource,
  passengerDisplayName,
  partyTotal,
} from "@/lib/booking";
import { googleMapsUrl } from "@/lib/booking";
import { resolveMeetupLabels } from "@/components/meetup-locations";
import { RIDE_COLUMNS, RIDE_WITH_JOIN } from "@/lib/rides-query";
import {
  HOME_ADDRESS_MAX_LENGTH,
  parseHomeAddress,
} from "@/lib/profile-save";

const repoRoot = process.cwd();

function readRepo(path: string) {
  return readFileSync(`${repoRoot}/${path}`, "utf8");
}

test("ride browse selects exclude raw pickup and dropoff columns", () => {
  assert.doesNotMatch(RIDE_COLUMNS, /pickup_location/);
  assert.doesNotMatch(RIDE_COLUMNS, /dropoff_location/);
  assert.doesNotMatch(RIDE_WITH_JOIN, /pickup_location/);
  assert.doesNotMatch(RIDE_WITH_JOIN, /select\("\*"\)/);
});

test("auth ride list pages use explicit ride column lists", () => {
  for (const path of [
    "src/app/(desktop)/rides/page.tsx",
    "src/app/m/page.tsx",
    "src/app/(desktop)/page.tsx",
    "src/lib/events.ts",
    "src/app/(desktop)/rides/[id]/page.tsx",
    "src/app/m/rides/[id]/page.tsx",
  ]) {
    const source = readRepo(path);
    assert.match(source, /RIDE_WITH_JOIN/, `${path} should use RIDE_WITH_JOIN`);
    assert.doesNotMatch(source, /select\("\*, driver:profiles!rides_driver_id_fkey/, path);
  }
});

test("requestSeat forwards guest_count and pickup_note to RPC with validation", () => {
  const source = readRepo("src/app/rides/actions.ts");
  const fn = source.slice(
    source.indexOf("export async function requestSeat"),
    source.indexOf("export async function setPassengerStatus"),
  );

  assert.match(fn, /parseGuestCount/);
  assert.match(fn, /parsePickupSource/);
  assert.match(fn, /getHomeAddress/);
  assert.match(fn, /p_guest_count: guestCount/);
  assert.match(fn, /p_pickup_note: pickupNote/);
  assert.match(fn, /success: true, guestCount, pickupNote/);
});

test("profile saves home address only through set_home_address RPC", () => {
  for (const path of ["src/app/profile/actions.ts", "src/app/m/actions.ts"]) {
    const source = readRepo(path);
    assert.match(source, /setHomeAddress/);
    assert.match(source, /parseHomeAddress\(formData\.get\("home_address"\)\)/);
    assert.match(source, /return \{ error: profileSaveError\(error\) \}/);
    assert.doesNotMatch(source, /\.upsert\(\{[^}]*home_address/);
  }
  assert.doesNotMatch(readRepo("src/lib/types.ts"), /home_address/);
});

test("home address validation accepts 500 characters and rejects 501 inline", () => {
  assert.equal(HOME_ADDRESS_MAX_LENGTH, 500);
  assert.equal(parseHomeAddress(` ${"a".repeat(500)} `), "a".repeat(500));
  assert.throws(
    () => parseHomeAddress("a".repeat(501)),
    /Home address must be 500 characters or fewer/,
  );
});

test("desktop and mobile profile forms cap home input and preserve values on errors", () => {
  const desktop = readRepo("src/app/(desktop)/profile/page.tsx");
  const mobile = readRepo("src/app/m/profile/edit/page.tsx");
  const form = readRepo("src/components/profile-form.tsx");

  assert.match(desktop, /name="home_address"[\s\S]*maxLength=\{500\}/);
  assert.match(mobile, /name="home_address"[\s\S]*maxLength=\{500\}/);
  assert.match(desktop, /<ProfileForm[\s\S]*action=\{updateProfile\}/);
  assert.match(mobile, /<ProfileForm[\s\S]*action=\{updateProfileMobile\}/);
  assert.match(form, /event\.preventDefault\(\)/);
  assert.match(form, /new FormData\(event\.currentTarget\)/);
  assert.match(form, /InlineActionError/);
  assert.doesNotMatch(form, /\.reset\(/);
});

test("booking validation enforces party size within seat availability", () => {
  assert.equal(partyTotal(0), 1);
  assert.equal(partyTotal(2), 3);
  assert.equal(maxGuestCount(1), 0);
  assert.equal(maxGuestCount(4), 3);
  assert.equal(parseGuestCount("1", 3), 1);
  assert.throws(() => parseGuestCount("5", 3), /Party size must be between/);
  assert.throws(() => parseGuestCount("3", 2), /room for at most/);
  assert.equal(parsePickupSource("home"), "home");
  assert.equal(parsePickupSource("custom"), "custom");
  assert.equal(parsePickupSource(""), null);
});

test("party labels and seat totals include guests", () => {
  assert.equal(passengerDisplayName("Alex", 0), "Alex");
  assert.equal(passengerDisplayName("Alex", 2), "Alex (+2)");
  assert.equal(
    confirmedSeatTotal([
      { status: "confirmed", guest_count: 1 },
      { status: "confirmed", guest_count: 0 },
      { status: "pending", guest_count: 3 },
    ]),
    3,
  );
});

test("meetup visibility keeps coarse labels for unrelated viewers", () => {
  const resolved = resolveMeetupLabels({
    coarsePickup: "Fremont area",
    coarseDropoff: "JCNC area",
    meetupRows: [
      {
        pickup_location: "123 Main St",
        dropoff_location: "Temple lot",
        pickup_note: "Home snapshot",
        passenger_id: "rider-1",
      },
    ],
    userId: "stranger",
    isDriver: false,
  });

  assert.equal(resolved.pickupLabel, "Fremont area");
  assert.equal(resolved.dropoffLabel, "JCNC area");
  assert.equal(resolved.pickupMapsUrl, null);
  assert.equal(resolved.selfPickupNote, null);
});

test("meetup visibility exposes exact locations and maps links to entitled viewers", () => {
  const driverView = resolveMeetupLabels({
    coarsePickup: "Fremont area",
    coarseDropoff: "JCNC area",
    meetupRows: [
      {
        pickup_location: "123 Main St",
        dropoff_location: "Temple lot",
        pickup_note: "Home snapshot",
        passenger_id: "rider-1",
      },
    ],
    userId: "driver-1",
    isDriver: true,
  });
  assert.equal(driverView.pickupLabel, "123 Main St");
  assert.match(driverView.pickupMapsUrl ?? "", /^https:\/\/maps\.google\.com\/\?q=/);

  const riderView = resolveMeetupLabels({
    coarsePickup: "Fremont area",
    coarseDropoff: "JCNC area",
    meetupRows: [
      {
        pickup_location: "123 Main St",
        dropoff_location: "Temple lot",
        pickup_note: "Home snapshot",
        passenger_id: "rider-1",
      },
    ],
    userId: "rider-1",
    isDriver: false,
  });
  assert.equal(riderView.selfPickupNote, "Home snapshot");
  assert.match(riderView.selfPickupMapsUrl ?? "", /Home%20snapshot/);
});

test("pending rider reload shows only their pickup selection", () => {
  const pendingView = resolveMeetupLabels({
    coarsePickup: "Fremont area",
    coarseDropoff: "JCNC area",
    meetupRows: [
      {
        pickup_location: null,
        dropoff_location: null,
        pickup_note: "Home snapshot",
        passenger_id: "rider-1",
      },
    ],
    userId: "rider-1",
    isDriver: false,
  });

  assert.equal(pendingView.pickupLabel, "Fremont area");
  assert.equal(pendingView.dropoffLabel, "JCNC area");
  assert.equal(pendingView.pickupMapsUrl, null);
  assert.equal(pendingView.selfPickupNote, "Home snapshot");
  assert.match(pendingView.selfPickupMapsUrl ?? "", /Home%20snapshot/);
});

test("google maps deep links encode addresses without API keys", () => {
  const url = googleMapsUrl(" 123 Main St, Fremont ");
  assert.equal(url, "https://maps.google.com/?q=123%20Main%20St%2C%20Fremont");
  assert.doesNotMatch(url, /key=/);
});

test("desktop and mobile booking UIs share reserve seat form", () => {
  const form = readRepo("src/components/reserve-seat-form.tsx");
  assert.match(form, /guest_count/);
  assert.match(form, /pickup_source/);
  assert.match(form, /pickup_note/);
  assert.match(form, /PendingActionButton/);
  assert.match(readRepo("src/components/ride-actions.tsx"), /ReserveSeatForm/);
  assert.match(readRepo("src/components/mobile/m-reserve.tsx"), /ReserveSeatForm/);
});

test("desktop and mobile cancellation gates reuse the same confirmed count", () => {
  const desktop = readRepo("src/app/(desktop)/rides/[id]/page.tsx");
  const mobile = readRepo("src/app/m/rides/[id]/page.tsx");

  assert.match(desktop, /confirmedRiderCount=\{confirmedCount\}/);
  assert.match(mobile, /confirmedRiderCount=\{confirmedCount\}/);
});

test("types include guest_count and keep home_address off Profile", () => {
  const types = readRepo("src/lib/types.ts");
  const rideBlock = types.slice(
    types.indexOf("export type Ride = {"),
    types.indexOf("export type RideRequest"),
  );
  assert.match(types, /guest_count: number/);
  assert.match(types, /RideMeetup/);
  assert.doesNotMatch(rideBlock, /pickup_location/);
  assert.doesNotMatch(types, /export type Profile = \{[\s\S]*?home_address/);
});

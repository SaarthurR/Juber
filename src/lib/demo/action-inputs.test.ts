import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState, DEMO_IDS } from "./fixtures";
import { demoProfileCommands, demoRequestCommand, demoRideCommand } from "./action-inputs";
import type { DemoSession } from "./types";

function session(): DemoSession {
  const state = createDemoState("2026-07-13");
  return {
    id: "demo-session",
    ownerKind: "admin",
    ownerId: DEMO_IDS.profiles.admin,
    activeActorId: DEMO_IDS.profiles.admin,
    seedDay: state.seedDay,
    revision: 0,
    state,
    expiresAt: "2026-07-14T00:00:00.000Z",
  };
}

test("demo ride and request forms produce reducer commands without providers", () => {
  const demo = session();
  const ride = new FormData();
  ride.set("direction", "to_jcnc");
  ride.set("route_place", "Fremont");
  ride.set("depart_at", "2026-07-20T10:00");
  ride.set("seats_total", "3");
  const rideCommand = demoRideCommand(demo, ride);
  assert.equal(rideCommand.type, "post_ride");
  if (rideCommand.type === "post_ride") {
    assert.equal(rideCommand.input.origin_label, "Fremont");
    assert.equal(rideCommand.input.seats_available, 3);
  }

  const request = new FormData();
  request.set("direction", "toJCNC");
  request.set("neighborhood", "Milpitas");
  request.set("earliest_date", "2026-07-20");
  request.set("latest_date", "2026-07-22");
  const requestCommand = demoRequestCommand(demo, request, true);
  assert.equal(requestCommand.type, "post_request");
  if (requestCommand.type === "post_request") assert.equal(requestCommand.input.origin_label, "Milpitas");
});

test("demo profile forms require a baked address and emit profile/contact commands", () => {
  const demo = session();
  const invalid = new FormData();
  invalid.set("home_address", "1 Network Request Way");
  assert.throws(() => demoProfileCommands(demo, invalid, "Maya Cohen"), /demo suggestions/);

  const valid = new FormData();
  valid.set("phone", "+1 415 555 0100");
  valid.set("home_address", "3300 Capitol Ave, Fremont, CA 94538");
  const [profile, contact] = demoProfileCommands(demo, valid, "Maya Cohen");
  assert.equal(profile.type, "update_profile");
  assert.equal(contact.type, "update_contact");
  if (contact.type === "update_contact") assert.equal(contact.values.homeAddress, "3300 Capitol Ave, Fremont, CA 94538");
});

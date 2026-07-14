import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_DECISION_OPTIONS } from "../admin-moderation";
import { confirmedSeatTotal } from "../booking";
import { createDemoState, DEMO_IDS } from "./fixtures";
import { queryDemoAdminCase, queryDemoAdminEvidence, queryDemoRide } from "./queries";
import { reduceDemoState } from "./reducer";
import { DemoDomainError, type DemoState } from "./types";

const seedDay = "2026-07-13";
const ids = DEMO_IDS;

function activeCapacityIsConsistent(state: DemoState) {
  for (const ride of Object.values(state.rides).filter((item) => item.status === "active")) {
    const occupied = confirmedSeatTotal(Object.values(state.passengers).filter((item) => item.ride_id === ride.id));
    assert.equal(ride.seats_available, ride.seats_total - occupied, ride.id);
  }
}

test("canonical fixture covers every demo pathway with stable day-relative IDs", () => {
  const first = createDemoState(seedDay);
  const second = createDemoState(seedDay);
  assert.deepEqual(first, second);
  assert.equal(Object.values(first.profiles).filter((item) => item.is_admin).length, 1);
  assert.deepEqual(new Set(Object.values(first.notifications).map((item) => item.type)), new Set(["seat_requested", "seat_confirmed", "seat_declined", "seat_cancelled", "ride_cancelled", "ride_completed", "request_accepted", "new_message", "event_request_approved", "event_request_rejected", "moderation_report_submitted"]));
  assert.deepEqual(new Set(Object.values(first.reports).map((item) => item.targetType)), new Set(["user", "ride", "ride_request", "message"]));
  assert.ok(Object.values(first.rides).every((item) => item.depart_at.startsWith("2026-") || item.depart_at.startsWith("2027-")));
  assert.ok(Object.values(first.appeals).some((item) => item.status === "pending"));
  assert.ok(Object.values(first.bans).some((item) => item.compensatedAt));
  activeCapacityIsConsistent(first);
});

test("seat decisions maintain capacity, notification, conversation, and idempotency invariants", () => {
  const initial = createDemoState(seedDay);
  const beforeNotifications = Object.keys(initial.notifications).length;
  const confirmed = reduceDemoState(initial, { type: "set_passenger_status", actorId: ids.profiles.admin, passengerId: ids.passengers.pending, status: "confirmed" }).state;
  assert.equal(confirmed.passengers[ids.passengers.pending].status, "confirmed");
  assert.equal(confirmed.rides[ids.rides.pending].seats_available, 1);
  assert.equal(Object.keys(confirmed.notifications).length, beforeNotifications + 1);
  assert.ok(Object.values(confirmed.conversations).some((item) => item.rideId === ids.rides.pending && item.participantIds.includes(ids.profiles.rider)));
  const retried = reduceDemoState(confirmed, { type: "set_passenger_status", actorId: ids.profiles.admin, passengerId: ids.passengers.pending, status: "confirmed" }).state;
  assert.equal(retried.rides[ids.rides.pending].seats_available, 1);
  assert.equal(Object.keys(retried.notifications).length, beforeNotifications + 1);
  activeCapacityIsConsistent(retried);
  const declined = reduceDemoState(initial, { type: "set_passenger_status", actorId: ids.profiles.admin, passengerId: ids.passengers.pending, status: "declined" }).state;
  assert.equal(declined.rides[ids.rides.pending].seats_available, 3);
  assert.equal(declined.passengers[ids.passengers.pending].status, "declined");
});

test("solo riders use zero guests while consuming one seat", () => {
  const requested = reduceDemoState(createDemoState(seedDay), { type: "request_seat", actorId: ids.profiles.admin, rideId: ids.rides.reservable, guestCount: 0, pickupLocation: "3251 20th Ave, San Francisco, CA" });
  const passengerId = String(requested.value);
  assert.equal(requested.state.passengers[passengerId].guest_count, 0);
  const confirmed = reduceDemoState(requested.state, { type: "set_passenger_status", actorId: ids.profiles.driver, passengerId, status: "confirmed" }).state;
  assert.equal(confirmed.rides[ids.rides.reservable].seats_available, 2);
  const cancelled = reduceDemoState(confirmed, { type: "cancel_seat", actorId: ids.profiles.admin, passengerId }).state;
  assert.equal(cancelled.rides[ids.rides.reservable].seats_available, 3);
});

test("request acceptance and message retries produce one coherent conversation and notification", () => {
  const initial = createDemoState(seedDay);
  const accepted = reduceDemoState(initial, { type: "accept_request", actorId: ids.profiles.admin, requestId: ids.requests.available });
  const conversationId = String(accepted.value);
  assert.equal(accepted.state.rideRequests[ids.requests.available].status, "fulfilled");
  assert.equal(accepted.state.rideRequests[ids.requests.available].accepted_driver_id, ids.profiles.admin);
  assert.equal(Object.values(accepted.state.notifications).filter((item) => item.type === "request_accepted" && item.request_id === ids.requests.available).length, 1);
  const messageId = "99000000-0000-4000-8000-000000000001";
  const sent = reduceDemoState(accepted.state, { type: "send_message", actorId: ids.profiles.admin, conversationId, body: "I can pick you up at 4:30.", clientMessageId: messageId }).state;
  const retried = reduceDemoState(sent, { type: "send_message", actorId: ids.profiles.admin, conversationId, body: "I can pick you up at 4:30.", clientMessageId: messageId }).state;
  assert.equal(Object.values(retried.messages).filter((item) => item.id === messageId).length, 1);
  assert.equal(Object.values(retried.notifications).filter((item) => item.type === "new_message" && item.conversation_id === conversationId).length, 1);
});

test("exact route and pickup data remain authorized", () => {
  const state = createDemoState(seedDay);
  assert.equal(queryDemoRide(state, ids.rides.confirmed, null)?.meetup, null);
  assert.equal(queryDemoRide(state, ids.rides.confirmed, ids.profiles.reporter)?.meetup, null);
  assert.equal(queryDemoRide(state, ids.rides.confirmed, ids.profiles.admin)?.meetup?.routeDistanceMiles, 6.7);
  assert.equal(queryDemoRide(state, ids.rides.pending, ids.profiles.admin)?.passengers[0].pickupLocation, state.contacts[ids.profiles.rider].homeAddress);
});

test("moderation decisions require bound current evidence and enforce the decision matrix", () => {
  const initial = createDemoState(seedDay);
  assert.deepEqual(ADMIN_DECISION_OPTIONS.inconclusive, ["none"]);
  const initialCase = queryDemoAdminCase(initial, ids.profiles.admin, ids.reports.userPending);
  assert.ok(initialCase && !("evidence" in initialCase));
  assert.equal(queryDemoAdminEvidence(initial, ids.profiles.admin, ids.reports.userPending, "missing"), null);
  const auditCount = Object.keys(initial.moderationActions).length;
  const revealed = reduceDemoState(initial, { type: "reveal_evidence", actorId: ids.profiles.admin, reportId: ids.reports.userPending });
  const receiptId = String(revealed.value);
  assert.equal(Object.keys(revealed.state.moderationActions).length, auditCount + 1);
  assert.equal(Object.values(revealed.state.moderationActions).at(-1)?.action, "evidence_viewed");
  assert.equal(queryDemoAdminEvidence(revealed.state, ids.profiles.admin, ids.reports.userPending, receiptId)?.reportId, ids.reports.userPending);
  const decided = reduceDemoState(revealed.state, { type: "close_report", actorId: ids.profiles.admin, reportId: ids.reports.userPending, expectedVersion: 0, receiptId, verdict: "violation", enforcement: "warn_reported", resolution: "Respect community safety expectations." }).state;
  assert.equal(decided.reports[ids.reports.userPending].verdictVersion, 1);
  assert.ok(Object.values(decided.warnings).some((item) => item.userId === ids.profiles.reported && item.reportId === ids.reports.userPending));
  assert.ok(Object.values(decided.outcomes).some((item) => item.userId === ids.profiles.reported && item.type === "warning"));
  assert.throws(() => reduceDemoState(decided, { type: "close_report", actorId: ids.profiles.admin, reportId: ids.reports.userPending, expectedVersion: 1, receiptId, verdict: "inconclusive", enforcement: "none", resolution: "Changed" }), (error) => error instanceof DemoDomainError && error.code === "terminal");
  const revisableEvidence = reduceDemoState(initial, { type: "reveal_evidence", actorId: ids.profiles.admin, reportId: ids.reports.requestRevisable });
  const revisableReceipt = String(revisableEvidence.value);
  const revised = reduceDemoState(revisableEvidence.state, { type: "revise_report", actorId: ids.profiles.admin, reportId: ids.reports.requestRevisable, expectedVersion: 1, receiptId: revisableReceipt, verdict: "inconclusive", enforcement: "none", resolution: "Evidence was inconclusive." }).state;
  assert.throws(() => reduceDemoState(revised, { type: "revise_report", actorId: ids.profiles.admin, reportId: ids.reports.requestRevisable, expectedVersion: 2, receiptId: revisableReceipt, verdict: "no_violation", enforcement: "none", resolution: "Changed again" }), (error) => error instanceof DemoDomainError && error.code === "evidence");
});

test("moderation fixture recipients and outcome provenance stay coherent", () => {
  const state = createDemoState(seedDay);
  for (const warning of Object.values(state.warnings)) assert.equal(state.reports[warning.reportId].targetUserId, warning.userId);
  for (const ban of Object.values(state.bans)) assert.equal(state.reports[ban.reportId].targetUserId, ban.userId);
  const expectedAction = { warning: "warning", ban: "ban", unban: "unban", appeal_granted: "appeal_resolved", appeal_denied: "appeal_resolved" } as const;
  for (const outcome of Object.values(state.outcomes)) {
    const action = state.moderationActions[outcome.sourceActionId];
    assert.ok(action);
    assert.equal(action.userId, outcome.userId);
    assert.equal(action.action, expectedAction[outcome.type]);
  }
});

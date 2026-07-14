import { ADMIN_DECISION_OPTIONS } from "../admin-moderation";
import { partyTotal } from "../booking";
import type { NotificationType } from "../types";
import {
  DemoDomainError,
  type DemoCommand,
  type DemoModerationAction,
  type DemoMutationResult,
  type DemoState,
} from "./types";

function fail(code: string, message: string): never {
  throw new DemoDomainError(code, message);
}

function id(state: DemoState) {
  const next = (state.counters.id ?? 0) + 1;
  state.counters.id = next;
  return `90000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
}

function profile(state: DemoState, actorId: string) {
  return state.profiles[actorId] ?? fail("not_found", "Demo profile not found");
}

function admin(state: DemoState, actorId: string) {
  const actor = profile(state, actorId);
  if (!actor.is_admin) fail("forbidden", "Demo administrator access required");
  return actor;
}

function now(state: DemoState) {
  return state.now;
}

function addDays(iso: string, days: number) {
  const value = new Date(iso);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function notify(
  state: DemoState,
  recipientId: string,
  actorId: string | null,
  type: NotificationType,
  values: Partial<{ ride_id: string; request_id: string; conversation_id: string; event_id: string; report_id: string; message: string }> = {},
) {
  const notificationId = id(state);
  state.notifications[notificationId] = {
    id: notificationId,
    recipient_id: recipientId,
    actor_id: actorId,
    type,
    ride_id: values.ride_id ?? null,
    request_id: values.request_id ?? null,
    conversation_id: values.conversation_id ?? null,
    event_id: values.event_id ?? null,
    report_id: values.report_id ?? null,
    message: values.message ?? null,
    read_at: null,
    created_at: now(state),
  };
  return notificationId;
}

function openConversation(
  state: DemoState,
  actorId: string,
  otherUserId: string,
  rideId: string | null,
  requestId: string | null,
) {
  profile(state, actorId);
  profile(state, otherUserId);
  if (actorId === otherUserId) fail("invalid", "A conversation needs another member");
  const rideAuthorized = rideId
    ? (() => {
        const ride = state.rides[rideId];
        if (!ride) return false;
        const passengerIds = Object.values(state.passengers).filter((item) => item.ride_id === rideId && (item.status === "pending" || item.status === "confirmed")).map((item) => item.passenger_id);
        return [actorId, otherUserId].includes(ride.driver_id) && [actorId, otherUserId].some((item) => passengerIds.includes(item));
      })()
    : false;
  const requestAuthorized = requestId
    ? (() => {
        const request = state.rideRequests[requestId];
        return Boolean(request && request.status === "fulfilled" && [actorId, otherUserId].includes(request.rider_id) && request.accepted_driver_id && [actorId, otherUserId].includes(request.accepted_driver_id));
      })()
    : false;
  if (!rideAuthorized && !requestAuthorized) fail("forbidden", "Conversation context is not authorized");
  const existing = Object.values(state.conversations).find((conversation) =>
    conversation.rideId === rideId
    && conversation.requestId === requestId
    && conversation.participantIds.includes(actorId)
    && conversation.participantIds.includes(otherUserId),
  );
  if (existing) {
    existing.hiddenBy = existing.hiddenBy.filter((item) => item !== actorId && item !== otherUserId);
    return existing.id;
  }
  const conversationId = id(state);
  state.conversations[conversationId] = {
    id: conversationId,
    participantIds: [actorId, otherUserId],
    rideId,
    requestId,
    hiddenBy: [],
    createdAt: now(state),
  };
  return conversationId;
}

function audit(
  state: DemoState,
  actorId: string | null,
  reportId: string | null,
  userId: string | null,
  action: string,
  detail: Record<string, unknown>,
) {
  const actionId = id(state);
  const row: DemoModerationAction = { id: actionId, reportId, actorId, userId, action, detail, createdAt: now(state) };
  state.moderationActions[actionId] = row;
  return row;
}

function applyEnforcement(
  state: DemoState,
  actorId: string,
  reportId: string,
  enforcement: "none" | "warn_reported" | "warn_reporter" | "temporary_ban" | "permanent_ban",
  resolution: string,
  banDays?: 1 | 7 | 30,
) {
  const report = state.reports[reportId];
  const userId = enforcement === "warn_reporter" ? report.reporterId : report.targetUserId;
  if (enforcement === "none") return;
  if (!userId) fail("invalid_target", "This enforcement needs a target member");
  if (enforcement === "warn_reported" || enforcement === "warn_reporter") {
    const action = audit(state, actorId, reportId, userId, "warning", { note: resolution });
    const outcomeId = id(state);
    const warningId = id(state);
    state.warnings[warningId] = { id: warningId, reportId, userId, note: resolution, outcomeId, createdAt: now(state) };
    state.outcomes[outcomeId] = { id: outcomeId, userId, reportId, type: "warning", sourceActionId: action.id, acknowledgedAt: null, createdAt: now(state) };
    return;
  }
  const activeBan = Object.values(state.bans).find((ban) => ban.userId === userId && !ban.liftedAt && (!ban.expiresAt || ban.expiresAt > now(state)));
  if (activeBan) fail("active_ban", "The member already has an active ban");
  if (enforcement === "temporary_ban" && !banDays) fail("invalid", "Temporary bans require a duration");
  const action = audit(state, actorId, reportId, userId, "ban", { days: enforcement === "temporary_ban" ? banDays : null });
  const banId = id(state);
  state.bans[banId] = {
    id: banId,
    reportId,
    userId,
    reason: resolution,
    expiresAt: enforcement === "temporary_ban" ? addDays(now(state), banDays!) : null,
    liftedAt: null,
    compensatedAt: null,
    createdAt: now(state),
  };
  const outcomeId = id(state);
  state.outcomes[outcomeId] = { id: outcomeId, userId, reportId, type: "ban", sourceActionId: action.id, acknowledgedAt: null, createdAt: now(state) };
}

function decideReport(
  state: DemoState,
  command: Extract<DemoCommand, { type: "close_report" | "revise_report" }>,
) {
  admin(state, command.actorId);
  const report = state.reports[command.reportId] ?? fail("not_found", "Demo report not found");
  if (command.type === "close_report" && (report.status === "actioned" || report.status === "dismissed")) fail("terminal", "This report is already closed");
  if (command.type === "revise_report" && report.verdict === null) fail("invalid", "This report has no decision to revise");
  if (report.verdictVersion !== command.expectedVersion) fail("stale", "The report version changed");
  const receipt = state.evidenceReceipts[command.receiptId];
  if (!receipt || receipt.reportId !== report.id || receipt.reportVersion !== report.verdictVersion || receipt.adminId !== command.actorId) {
    fail("evidence", "Open this report's evidence again");
  }
  if (!ADMIN_DECISION_OPTIONS[command.verdict].includes(command.enforcement)) fail("invalid_decision", "Verdict and enforcement do not match");
  if (command.type === "revise_report" && report.enforcement !== "none") fail("revision_blocked", "Delivered enforcement cannot be revised");
  report.status = command.verdict === "violation" ? "actioned" : "dismissed";
  report.resolution = command.resolution;
  report.verdict = command.verdict;
  report.enforcement = command.enforcement;
  report.banDays = command.enforcement === "temporary_ban" ? command.banDays ?? null : null;
  report.verdictVersion += 1;
  report.reviewedBy = command.actorId;
  report.reviewedAt = now(state);
  state.evidence[report.id] = { ...state.evidence[report.id], version: report.verdictVersion };
  audit(state, command.actorId, report.id, report.targetUserId, command.type === "revise_report" ? "verdict_revised" : "report_status", {
    verdict: command.verdict,
    enforcement: command.enforcement,
    version: report.verdictVersion,
    resolution: command.resolution,
  });
  applyEnforcement(state, command.actorId, report.id, command.enforcement, command.resolution, command.banDays);
  return report.id;
}

export function reduceDemoState(source: DemoState, command: DemoCommand): DemoMutationResult {
  const state = structuredClone(source);
  switch (command.type) {
    case "switch_actor": {
      profile(state, command.actorId);
      state.activeActorId = command.actorId;
      return { state, value: command.actorId };
    }
    case "set_scenario":
      state.scenario = command.scenario;
      return { state, value: command.scenario };
    case "post_ride": {
      profile(state, command.actorId);
      if (!state.contacts[command.actorId]?.phone && !state.contacts[command.actorId]?.whatsapp) fail("contact_required", "Add a contact method before posting");
      if (command.input.seats_total < 1 || command.input.seats_available < 0 || command.input.seats_available > command.input.seats_total) fail("invalid_capacity", "Ride capacity is invalid");
      const rideId = id(state);
      state.rides[rideId] = { ...command.input, id: rideId, driver_id: command.actorId, status: "active", cancellation_reason: null, created_at: now(state) };
      return { state, value: rideId };
    }
    case "cancel_ride": {
      const ride = state.rides[command.rideId] ?? fail("not_found", "Demo ride not found");
      if (ride.driver_id !== command.actorId) fail("forbidden", "Only the driver can cancel this ride");
      if (ride.status !== "active") fail("terminal", "This ride is already closed");
      ride.status = "cancelled";
      ride.cancellation_reason = command.reason;
      for (const passenger of Object.values(state.passengers).filter((item) => item.ride_id === ride.id && (item.status === "pending" || item.status === "confirmed"))) {
        notify(state, passenger.passenger_id, command.actorId, "ride_cancelled", { ride_id: ride.id, message: command.reason });
      }
      return { state, value: ride.id };
    }
    case "close_ride": {
      const ride = state.rides[command.rideId] ?? fail("not_found", "Demo ride not found");
      if (ride.driver_id !== command.actorId) fail("forbidden", "Only the driver can close this ride");
      if (ride.status !== "active") fail("terminal", "This ride is already closed");
      ride.status = "completed";
      for (const passenger of Object.values(state.passengers).filter((item) => item.ride_id === ride.id && item.status === "confirmed")) {
        notify(state, passenger.passenger_id, command.actorId, "ride_completed", { ride_id: ride.id });
      }
      return { state, value: ride.id };
    }
    case "post_request": {
      profile(state, command.actorId);
      if (!state.contacts[command.actorId]?.phone && !state.contacts[command.actorId]?.whatsapp) fail("contact_required", "Add a contact method before posting");
      if (command.input.seats_needed < 1) fail("invalid_capacity", "At least one seat is required");
      const requestId = id(state);
      state.rideRequests[requestId] = { ...command.input, id: requestId, rider_id: command.actorId, status: "active", accepted_driver_id: null, accepted_at: null, expired: false, created_at: now(state) };
      return { state, value: requestId };
    }
    case "cancel_request": {
      const request = state.rideRequests[command.requestId] ?? fail("not_found", "Demo request not found");
      if (request.rider_id !== command.actorId) fail("forbidden", "Only the rider can cancel this request");
      if (request.status !== "active") fail("terminal", "This request is already closed");
      request.status = "cancelled";
      return { state, value: request.id };
    }
    case "accept_request": {
      const request = state.rideRequests[command.requestId] ?? fail("not_found", "Demo request not found");
      if (request.rider_id === command.actorId) fail("forbidden", "You cannot accept your own request");
      if (request.status === "fulfilled" && request.accepted_driver_id === command.actorId) {
        return { state, value: openConversation(state, command.actorId, request.rider_id, null, request.id) };
      }
      if (request.status !== "active" || request.expired) fail("terminal", "This request is no longer available");
      if (!state.contacts[command.actorId]?.phone && !state.contacts[command.actorId]?.whatsapp) fail("contact_required", "Add a contact method before accepting");
      request.status = "fulfilled";
      request.accepted_driver_id = command.actorId;
      request.accepted_at = now(state);
      const conversationId = openConversation(state, command.actorId, request.rider_id, null, request.id);
      notify(state, request.rider_id, command.actorId, "request_accepted", { request_id: request.id, conversation_id: conversationId });
      return { state, value: conversationId };
    }
    case "request_seat": {
      const ride = state.rides[command.rideId] ?? fail("not_found", "Demo ride not found");
      if (ride.driver_id === command.actorId) fail("forbidden", "Drivers cannot reserve their own ride");
      profile(state, command.actorId);
      if (!state.contacts[command.actorId]?.phone && !state.contacts[command.actorId]?.whatsapp) fail("contact_required", "Add a contact method before reserving");
      if (ride.status !== "active" || ride.depart_at <= now(state)) fail("terminal", "This ride is no longer available");
      if (!Number.isInteger(command.guestCount) || command.guestCount < 0 || partyTotal(command.guestCount) > ride.seats_available) fail("capacity", "Not enough seats are available");
      const existing = Object.values(state.passengers).find((item) => item.ride_id === ride.id && item.passenger_id === command.actorId && (item.status === "pending" || item.status === "confirmed"));
      if (existing) return { state, value: existing.id };
      const passengerId = id(state);
      state.passengers[passengerId] = { id: passengerId, ride_id: ride.id, passenger_id: command.actorId, status: "pending", guest_count: command.guestCount, pickupLocation: command.pickupLocation, dropoffLocation: command.dropoffLocation ?? null, pickupNote: command.pickupNote ?? null, created_at: now(state) };
      const conversationId = openConversation(state, command.actorId, ride.driver_id, ride.id, null);
      notify(state, ride.driver_id, command.actorId, "seat_requested", { ride_id: ride.id, conversation_id: conversationId });
      return { state, value: passengerId };
    }
    case "set_passenger_status": {
      const passenger = state.passengers[command.passengerId] ?? fail("not_found", "Demo passenger not found");
      const ride = state.rides[passenger.ride_id] ?? fail("not_found", "Demo ride not found");
      if (ride.driver_id !== command.actorId) fail("forbidden", "Only the driver can decide this request");
      if (passenger.status === command.status) return { state, value: passenger.id };
      if (passenger.status !== "pending" || ride.status !== "active") fail("terminal", "This seat request is already decided");
      if (command.status === "confirmed") {
        const seats = partyTotal(passenger.guest_count);
        if (ride.seats_available < seats) fail("capacity", "Not enough seats are available");
        ride.seats_available -= seats;
        openConversation(state, command.actorId, passenger.passenger_id, ride.id, null);
      }
      passenger.status = command.status;
      notify(state, passenger.passenger_id, command.actorId, command.status === "confirmed" ? "seat_confirmed" : "seat_declined", { ride_id: ride.id });
      return { state, value: passenger.id };
    }
    case "cancel_seat": {
      const passenger = state.passengers[command.passengerId] ?? fail("not_found", "Demo passenger not found");
      if (passenger.passenger_id !== command.actorId) fail("forbidden", "Only the passenger can cancel this seat");
      if (passenger.status !== "pending" && passenger.status !== "confirmed") fail("terminal", "This seat is already closed");
      const ride = state.rides[passenger.ride_id] ?? fail("not_found", "Demo ride not found");
      if (passenger.status === "confirmed" && ride.status === "active") ride.seats_available = Math.min(ride.seats_total, ride.seats_available + partyTotal(passenger.guest_count));
      passenger.status = "cancelled";
      notify(state, ride.driver_id, command.actorId, "seat_cancelled", { ride_id: ride.id });
      return { state, value: passenger.id };
    }
    case "open_conversation":
      return { state, value: openConversation(state, command.actorId, command.otherUserId, command.rideId ?? null, command.requestId ?? null) };
    case "hide_conversation": {
      const conversation = state.conversations[command.conversationId] ?? fail("not_found", "Demo conversation not found");
      if (!conversation.participantIds.includes(command.actorId)) fail("forbidden", "You are not in this conversation");
      if (!conversation.hiddenBy.includes(command.actorId)) conversation.hiddenBy.push(command.actorId);
      return { state, value: conversation.id };
    }
    case "send_message": {
      const conversation = state.conversations[command.conversationId] ?? fail("not_found", "Demo conversation not found");
      if (!conversation.participantIds.includes(command.actorId)) fail("forbidden", "You are not in this conversation");
      const body = command.body.trim();
      if (!body || body.length > 2000) fail("invalid", "Message must be between 1 and 2000 characters");
      const existing = state.messages[command.clientMessageId];
      if (existing) {
        if (existing.conversation_id === conversation.id && existing.sender_id === command.actorId && existing.body === body) return { state, value: existing.id };
        fail("conflict", "Message ID was already used");
      }
      state.messages[command.clientMessageId] = { id: command.clientMessageId, conversation_id: conversation.id, sender_id: command.actorId, body, created_at: now(state), read_at: null };
      conversation.hiddenBy = [];
      for (const recipientId of conversation.participantIds.filter((item) => item !== command.actorId)) {
        notify(state, recipientId, command.actorId, "new_message", { conversation_id: conversation.id, message: body });
      }
      return { state, value: command.clientMessageId };
    }
    case "read_messages": {
      const conversation = state.conversations[command.conversationId] ?? fail("not_found", "Demo conversation not found");
      if (!conversation.participantIds.includes(command.actorId)) fail("forbidden", "You are not in this conversation");
      let count = 0;
      for (const message of Object.values(state.messages)) {
        if (message.conversation_id === conversation.id && message.sender_id !== command.actorId && !message.read_at) {
          message.read_at = now(state);
          count += 1;
        }
      }
      return { state, value: count };
    }
    case "mark_notification": {
      const notification = state.notifications[command.notificationId] ?? fail("not_found", "Demo notification not found");
      if (notification.recipient_id !== command.actorId) fail("forbidden", "This notification belongs to another member");
      notification.read_at ??= now(state);
      return { state, value: notification.id };
    }
    case "mark_all_notifications": {
      let count = 0;
      for (const notification of Object.values(state.notifications)) {
        if (notification.recipient_id === command.actorId && !notification.read_at) {
          notification.read_at = now(state);
          count += 1;
        }
      }
      return { state, value: count };
    }
    case "update_profile": {
      const current = profile(state, command.actorId);
      state.profiles[command.actorId] = { ...current, ...command.values, id: current.id, is_admin: current.is_admin, created_at: current.created_at };
      return { state, value: current.id };
    }
    case "update_contact": {
      profile(state, command.actorId);
      const current = state.contacts[command.actorId] ?? { profileId: command.actorId, phone: null, whatsapp: null, homeAddress: null, homeLat: null, homeLng: null };
      state.contacts[command.actorId] = { ...current, ...command.values, profileId: command.actorId };
      return { state, value: command.actorId };
    }
    case "suggest_event": {
      profile(state, command.actorId);
      const requestId = id(state);
      state.eventRequests[requestId] = { ...command.input, id: requestId, source: "user", source_url: null, status: "pending", requested_by: command.actorId, reviewed_by: null, approved_event_id: null, reviewed_at: null, created_at: now(state) };
      return { state, value: requestId };
    }
    case "create_event": {
      admin(state, command.actorId);
      const eventId = id(state);
      state.events[eventId] = { ...command.input, id: eventId, created_by: command.actorId, created_at: now(state) };
      return { state, value: eventId };
    }
    case "delete_event":
      admin(state, command.actorId);
      if (!state.events[command.eventId]) fail("not_found", "Demo event not found");
      delete state.events[command.eventId];
      return { state, value: command.eventId };
    case "create_place": {
      admin(state, command.actorId);
      const placeId = id(state);
      state.places[placeId] = { ...command.input, id: placeId, created_at: now(state) };
      return { state, value: placeId };
    }
    case "delete_place":
      admin(state, command.actorId);
      if (!state.places[command.placeId]) fail("not_found", "Demo place not found");
      delete state.places[command.placeId];
      return { state, value: command.placeId };
    case "review_event_request": {
      admin(state, command.actorId);
      const request = state.eventRequests[command.requestId] ?? fail("not_found", "Demo event request not found");
      if (request.status !== "pending") fail("terminal", "This event request was already reviewed");
      request.status = command.decision;
      request.reviewed_by = command.actorId;
      request.reviewed_at = now(state);
      if (command.decision === "approved") {
        const eventId = id(state);
        state.events[eventId] = { id: eventId, name: request.name, slug: request.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), description: request.description, venue_label: request.venue_label, start_date: request.start_date, end_date: request.end_date, source_url: null, is_active: true, created_by: command.actorId, created_at: now(state) };
        request.approved_event_id = eventId;
        if (request.requested_by) notify(state, request.requested_by, command.actorId, "event_request_approved", { event_id: eventId });
      } else if (request.requested_by) {
        notify(state, request.requested_by, command.actorId, "event_request_rejected");
      }
      return { state, value: request.approved_event_id ?? request.id };
    }
    case "delete_event_request":
      admin(state, command.actorId);
      if (!state.eventRequests[command.requestId]) fail("not_found", "Demo event request not found");
      delete state.eventRequests[command.requestId];
      return { state, value: command.requestId };
    case "import_events": {
      admin(state, command.actorId);
      const exists = Object.values(state.eventRequests).some((request) => request.source === "jcnc" && request.name === "JCNC Family Havdalah");
      if (exists) return { state, value: 0 };
      const requestId = id(state);
      state.eventRequests[requestId] = { id: requestId, name: "JCNC Family Havdalah", description: "Baked demo import.", venue_label: "JCNC", start_date: addDays(now(state), 22), end_date: addDays(now(state), 22), source: "jcnc", source_url: null, expected_traffic: "high", status: "pending", requested_by: null, reviewed_by: null, approved_event_id: null, reviewed_at: null, created_at: now(state) };
      return { state, value: 1 };
    }
    case "submit_report": {
      profile(state, command.actorId);
      const targetUserId = command.targetType === "user"
        ? state.profiles[command.targetId]?.id
        : command.targetType === "ride"
          ? state.rides[command.targetId]?.driver_id
          : command.targetType === "ride_request"
            ? state.rideRequests[command.targetId]?.rider_id
            : state.messages[command.targetId]?.sender_id;
      if (!targetUserId || targetUserId !== command.targetUserId) fail("invalid_target", "Report target does not match the referenced record");
      if (targetUserId === command.actorId) fail("forbidden", "You cannot report yourself");
      const reportId = id(state);
      state.reports[reportId] = { id: reportId, targetType: command.targetType, targetId: command.targetId, targetUserId, reporterId: command.actorId, reason: command.reason, details: command.details, status: "pending", resolution: null, verdict: null, enforcement: null, verdictVersion: 0, banDays: null, reviewedBy: null, reviewedAt: null, createdAt: now(state) };
      state.evidence[reportId] = { reportId, version: 0, snapshot: { targetType: command.targetType, targetId: command.targetId, details: command.details, message: command.targetType === "message" ? state.messages[command.targetId] ?? null : null } };
      audit(state, command.actorId, reportId, targetUserId, "report_submitted", { targetType: command.targetType, targetId: command.targetId });
      for (const administrator of Object.values(state.profiles).filter((item) => item.is_admin)) notify(state, administrator.id, command.actorId, "moderation_report_submitted", { report_id: reportId });
      return { state, value: reportId };
    }
    case "reveal_evidence": {
      admin(state, command.actorId);
      const report = state.reports[command.reportId] ?? fail("not_found", "Demo report not found");
      const evidence = state.evidence[report.id] ?? fail("not_found", "Demo evidence not found");
      const receiptId = id(state);
      state.evidenceReceipts[receiptId] = { id: receiptId, reportId: report.id, reportVersion: report.verdictVersion, adminId: command.actorId, createdAt: now(state) };
      audit(state, command.actorId, report.id, report.targetUserId, "evidence_viewed", { receiptId, version: evidence.version });
      return { state, value: receiptId };
    }
    case "close_report":
    case "revise_report":
      return { state, value: decideReport(state, command) };
    case "compensate_ban": {
      admin(state, command.actorId);
      const ban = state.bans[command.banId] ?? fail("not_found", "Demo ban not found");
      if (ban.liftedAt) return { state, value: ban.id };
      ban.liftedAt = now(state);
      ban.compensatedAt = now(state);
      const action = audit(state, command.actorId, ban.reportId, ban.userId, "unban", { reason: command.reason, compensated: true, banId: ban.id });
      const outcomeId = id(state);
      state.outcomes[outcomeId] = { id: outcomeId, userId: ban.userId, reportId: ban.reportId, type: "unban", sourceActionId: action.id, acknowledgedAt: null, createdAt: now(state) };
      return { state, value: ban.id };
    }
    case "submit_appeal": {
      const ban = state.bans[command.banId] ?? fail("not_found", "Demo ban not found");
      if (ban.userId !== command.actorId) fail("forbidden", "This ban belongs to another member");
      if (ban.liftedAt || (ban.expiresAt && ban.expiresAt <= now(state))) fail("terminal", "This ban is no longer active");
      const existing = Object.values(state.appeals).find((appeal) => appeal.banId === ban.id && appeal.status === "pending");
      if (existing) return { state, value: existing.id };
      const appealId = id(state);
      state.appeals[appealId] = { id: appealId, banId: ban.id, userId: command.actorId, text: command.text, status: "pending", resolvedAt: null, createdAt: now(state) };
      audit(state, command.actorId, ban.reportId, command.actorId, "appeal_submitted", { appealId, banId: ban.id });
      return { state, value: appealId };
    }
    case "resolve_appeal": {
      admin(state, command.actorId);
      const appeal = state.appeals[command.appealId] ?? fail("not_found", "Demo appeal not found");
      if (appeal.status !== "pending") fail("terminal", "This appeal was already resolved");
      appeal.status = command.decision;
      appeal.resolvedAt = now(state);
      const ban = state.bans[appeal.banId] ?? fail("not_found", "Demo ban not found");
      if (command.decision === "granted") ban.liftedAt = now(state);
      const action = audit(state, command.actorId, ban.reportId, appeal.userId, "appeal_resolved", { appealId: appeal.id, decision: command.decision, banId: ban.id });
      const outcomeId = id(state);
      state.outcomes[outcomeId] = { id: outcomeId, userId: appeal.userId, reportId: ban.reportId, type: command.decision === "granted" ? "appeal_granted" : "appeal_denied", sourceActionId: action.id, acknowledgedAt: null, createdAt: now(state) };
      return { state, value: appeal.id };
    }
    case "acknowledge_outcome": {
      const outcome = state.outcomes[command.outcomeId] ?? fail("not_found", "Demo outcome not found");
      if (outcome.userId !== command.actorId) fail("forbidden", "This outcome belongs to another member");
      outcome.acknowledgedAt ??= now(state);
      return { state, value: outcome.id };
    }
  }
}

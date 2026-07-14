import type {
  EventRequestWithRequester,
  NotificationWithContext,
  RideRequestWithRider,
  RideWithDriver,
} from "../types";
import { buildThreadSummaries, type ThreadContext, type ThreadSummary } from "../messages";
import type { DemoPassenger, DemoRide, DemoState } from "./types";

function available<T>(state: DemoState, values: T[]) {
  if (state.scenario === "read_error") throw new Error("Simulated recoverable demo read error");
  return state.scenario === "empty" ? [] : values;
}

function newest<T>(values: T[], createdAt: (value: T) => string) {
  return values.sort((a, b) => createdAt(b).localeCompare(createdAt(a)));
}

export function queryDemoIdentity(state: DemoState, actorId = state.activeActorId) {
  const value = state.profiles[actorId] ?? null;
  if (!value || state.scenario !== "incomplete_profile" || actorId !== state.activeActorId) return value;
  return { ...value, full_name: null, neighborhood: null, preferred_contact: null };
}

export function queryDemoRides(state: DemoState): RideWithDriver[] {
  return available(state, Object.values(state.rides)).map((ride) => ({
    ...ride,
    driver: state.profiles[ride.driver_id] ?? null,
    event: ride.event_id ? state.events[ride.event_id] ?? null : null,
  }));
}

export type DemoRideDetail = {
  ride: RideWithDriver;
  meetup: Pick<DemoRide, "meetupAddress" | "meetupLat" | "meetupLng" | "routeDistanceMiles" | "routeDurationMinutes"> | null;
  passengers: DemoPassenger[];
};

export function queryDemoRide(state: DemoState, rideId: string, actorId: string | null): DemoRideDetail | null {
  const ride = state.rides[rideId];
  if (!ride) return null;
  const passengers = Object.values(state.passengers).filter((item) => item.ride_id === ride.id);
  const authorized = actorId === ride.driver_id || passengers.some((item) => item.passenger_id === actorId && item.status === "confirmed");
  return {
    ride: { ...ride, driver: state.profiles[ride.driver_id] ?? null, event: ride.event_id ? state.events[ride.event_id] ?? null : null },
    meetup: authorized && state.scenario !== "maps_unavailable"
      ? { meetupAddress: ride.meetupAddress, meetupLat: ride.meetupLat, meetupLng: ride.meetupLng, routeDistanceMiles: ride.routeDistanceMiles, routeDurationMinutes: ride.routeDurationMinutes }
      : null,
    passengers: actorId === ride.driver_id ? passengers : passengers.filter((item) => item.passenger_id === actorId).map((item) => authorized ? item : { ...item, pickupLocation: null, dropoffLocation: null, pickupNote: null }),
  };
}

export function queryDemoRideRequests(state: DemoState): RideRequestWithRider[] {
  return available(state, Object.values(state.rideRequests)).map((request) => ({
    ...request,
    rider: state.profiles[request.rider_id] ?? null,
    event: request.event_id ? state.events[request.event_id] ?? null : null,
  }));
}

export function queryDemoNotifications(state: DemoState, actorId: string): NotificationWithContext[] {
  return available(state, newest(Object.values(state.notifications).filter((item) => item.recipient_id === actorId), (item) => item.created_at)).map((item) => ({
    ...item,
    actor: item.actor_id ? state.profiles[item.actor_id] ?? null : null,
    ride: item.ride_id ? state.rides[item.ride_id] ?? null : null,
    request: item.request_id ? state.rideRequests[item.request_id] ?? null : null,
    event: item.event_id ? state.events[item.event_id] ?? null : null,
  }));
}

export type DemoThread = {
  conversation: DemoState["conversations"][string];
  other: DemoState["profiles"][string] | null;
  messages: DemoState["messages"][string][];
  unread: number;
};

export function queryDemoThreads(state: DemoState, actorId: string): DemoThread[] {
  return available(state, Object.values(state.conversations).filter((item) => item.participantIds.includes(actorId) && !item.hiddenBy.includes(actorId))).map((conversation) => {
    const messages = newest(Object.values(state.messages).filter((item) => item.conversation_id === conversation.id), (item) => item.created_at);
    const otherId = conversation.participantIds.find((item) => item !== actorId);
    return { conversation, other: otherId ? state.profiles[otherId] ?? null : null, messages, unread: messages.filter((item) => item.sender_id !== actorId && !item.read_at).length };
  });
}

export function queryDemoThreadSummaries(state: DemoState, actorId: string): ThreadSummary[] {
  const threads = queryDemoThreads(state, actorId);
  const contexts = threads.map(({ conversation }) => {
    let context: ThreadContext;
    if (conversation.rideId && state.rides[conversation.rideId]) {
      const ride = state.rides[conversation.rideId];
      context = {
        kind: "ride",
        id: ride.id,
        status: ride.status,
        departAt: ride.depart_at,
        passengerStatus: Object.values(state.passengers).find(
          (passenger) => passenger.ride_id === ride.id && passenger.passenger_id === actorId,
        )?.status ?? null,
      };
    } else if (conversation.requestId && state.rideRequests[conversation.requestId]) {
      const request = state.rideRequests[conversation.requestId];
      context = {
        kind: "request",
        id: request.id,
        status: request.status,
        departAt: request.depart_at,
      };
    } else {
      context = { kind: "missing", id: conversation.id };
    }
    return { conversation_id: conversation.id, context };
  });

  return buildThreadSummaries({
    memberships: threads.map(({ conversation }) => ({
      conversation_id: conversation.id,
      user_id: actorId,
    })),
    hides: [],
    others: threads.map(({ conversation, other }) => ({
      conversation_id: conversation.id,
      user: other,
    })),
    aggregates: threads.map(({ conversation, messages, unread }) => ({
      conversation_id: conversation.id,
      last: messages[0] ?? null,
      unread,
    })),
    contexts,
    userId: actorId,
    now: state.now,
  });
}

export function queryDemoEvents(state: DemoState) {
  return available(state, Object.values(state.events).filter((item) => item.is_active));
}

export function queryDemoEventRequests(state: DemoState): EventRequestWithRequester[] {
  return available(state, Object.values(state.eventRequests)).map((request) => ({ ...request, requester: request.requested_by ? state.profiles[request.requested_by] ?? null : null }));
}

export function queryDemoModeration(state: DemoState, actorId: string) {
  const bans = Object.values(state.bans).filter((item) => item.userId === actorId && !item.liftedAt && (!item.expiresAt || item.expiresAt > state.now));
  return {
    banned: bans.length > 0,
    ban: bans[0] ?? null,
    warnings: Object.values(state.warnings).filter((item) => item.userId === actorId),
    appeals: Object.values(state.appeals).filter((item) => item.userId === actorId),
    outcomes: newest(Object.values(state.outcomes).filter((item) => item.userId === actorId), (item) => item.createdAt),
  };
}

export function queryDemoAdminReports(state: DemoState, actorId: string) {
  if (!state.profiles[actorId]?.is_admin) return [];
  return available(state, newest(Object.values(state.reports), (item) => item.createdAt));
}

export function queryDemoAdminCase(state: DemoState, actorId: string, reportId: string) {
  if (!state.profiles[actorId]?.is_admin) return null;
  const report = state.reports[reportId];
  if (!report) return null;
  return {
    report,
    reporter: state.profiles[report.reporterId] ?? null,
    reported: report.targetUserId ? state.profiles[report.targetUserId] ?? null : null,
    evidenceAvailable: Boolean(state.evidence[report.id]),
    history: newest(Object.values(state.moderationActions).filter((item) => item.reportId === report.id), (item) => item.createdAt),
    activeBan: Object.values(state.bans).find((item) => item.reportId === report.id && !item.liftedAt && (!item.expiresAt || item.expiresAt > state.now)) ?? null,
    canRevise: report.verdict !== null && report.enforcement === "none",
  };
}

export function queryDemoAdminEvidence(state: DemoState, actorId: string, reportId: string, receiptId: string) {
  if (!state.profiles[actorId]?.is_admin) return null;
  const report = state.reports[reportId];
  const receipt = state.evidenceReceipts[receiptId];
  if (!report || !receipt || receipt.reportId !== report.id || receipt.adminId !== actorId || receipt.reportVersion !== report.verdictVersion) return null;
  return state.evidence[report.id] ?? null;
}

export const demoQueries = {
  identity: queryDemoIdentity,
  rides: queryDemoRides,
  ride: queryDemoRide,
  rideRequests: queryDemoRideRequests,
  notifications: queryDemoNotifications,
  threads: queryDemoThreads,
  threadSummaries: queryDemoThreadSummaries,
  events: queryDemoEvents,
  eventRequests: queryDemoEventRequests,
  moderation: queryDemoModeration,
  adminReports: queryDemoAdminReports,
  adminCase: queryDemoAdminCase,
  adminEvidence: queryDemoAdminEvidence,
};

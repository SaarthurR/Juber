import type { NotificationType } from "../types";
import type { DemoState } from "./types";

export const DEMO_IDS = {
  profiles: {
    admin: "10000000-0000-4000-8000-000000000001",
    driver: "10000000-0000-4000-8000-000000000002",
    rider: "10000000-0000-4000-8000-000000000003",
    reported: "10000000-0000-4000-8000-000000000004",
    reporter: "10000000-0000-4000-8000-000000000005",
    warned: "10000000-0000-4000-8000-000000000006",
    banned: "10000000-0000-4000-8000-000000000007",
  },
  events: {
    shabbat: "20000000-0000-4000-8000-000000000001",
    festival: "20000000-0000-4000-8000-000000000002",
  },
  eventRequests: {
    pending: "21000000-0000-4000-8000-000000000001",
    approved: "21000000-0000-4000-8000-000000000002",
    rejected: "21000000-0000-4000-8000-000000000003",
    importCandidate: "21000000-0000-4000-8000-000000000004",
  },
  rides: {
    pending: "30000000-0000-4000-8000-000000000001",
    reservable: "30000000-0000-4000-8000-000000000002",
    confirmed: "30000000-0000-4000-8000-000000000003",
    full: "30000000-0000-4000-8000-000000000004",
    roundTrip: "30000000-0000-4000-8000-000000000005",
    cancelled: "30000000-0000-4000-8000-000000000006",
    completed: "30000000-0000-4000-8000-000000000007",
    eventLinked: "30000000-0000-4000-8000-000000000008",
  },
  requests: {
    available: "31000000-0000-4000-8000-000000000001",
    own: "31000000-0000-4000-8000-000000000002",
    fulfilled: "31000000-0000-4000-8000-000000000003",
    cancelled: "31000000-0000-4000-8000-000000000004",
    expired: "31000000-0000-4000-8000-000000000005",
  },
  passengers: {
    pending: "32000000-0000-4000-8000-000000000001",
    confirmed: "32000000-0000-4000-8000-000000000002",
    declined: "32000000-0000-4000-8000-000000000003",
    cancelled: "32000000-0000-4000-8000-000000000004",
    full: "32000000-0000-4000-8000-000000000005",
  },
  conversations: {
    pending: "40000000-0000-4000-8000-000000000001",
    confirmed: "40000000-0000-4000-8000-000000000002",
    request: "40000000-0000-4000-8000-000000000003",
    archived: "40000000-0000-4000-8000-000000000004",
  },
  reports: {
    userPending: "50000000-0000-4000-8000-000000000001",
    rideReviewing: "50000000-0000-4000-8000-000000000002",
    requestRevisable: "50000000-0000-4000-8000-000000000003",
    messageWarning: "50000000-0000-4000-8000-000000000004",
    temporaryBan: "50000000-0000-4000-8000-000000000005",
    permanentBan: "50000000-0000-4000-8000-000000000006",
    dismissed: "50000000-0000-4000-8000-000000000007",
    inconclusive: "50000000-0000-4000-8000-000000000008",
  },
  bans: {
    temporary: "51000000-0000-4000-8000-000000000001",
    permanent: "51000000-0000-4000-8000-000000000002",
    compensated: "51000000-0000-4000-8000-000000000003",
  },
  appeals: {
    pending: "52000000-0000-4000-8000-000000000001",
    resolved: "52000000-0000-4000-8000-000000000002",
  },
} as const;

export function currentLosAngelesDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function at(seedDay: string, days: number, hour = 12) {
  const date = new Date(`${seedDay}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour);
  return date.toISOString();
}

function records<T extends { id: string }>(values: T[]) {
  return Object.fromEntries(values.map((value) => [value.id, value]));
}

export function createDemoState(seedDay = currentLosAngelesDay()): DemoState {
  const p = DEMO_IDS.profiles;
  const r = DEMO_IDS.rides;
  const q = DEMO_IDS.requests;
  const c = DEMO_IDS.conversations;
  const reports = DEMO_IDS.reports;
  const createdAt = at(seedDay, -45, 16);
  const profile = (id: string, fullName: string, values: Record<string, unknown> = {}) => ({
    id,
    full_name: fullName,
    avatar_url: null,
    neighborhood: "San Francisco",
    instagram: null,
    pronouns: null,
    preferred_contact: "message" as const,
    car_make_model: null,
    car_color: null,
    bio: "Friendly Juber demo community member.",
    is_admin: false,
    created_at: createdAt,
    ...values,
  });
  const profiles = records([
    profile(p.admin, "Maya Cohen", { is_admin: true, car_make_model: "Blue Toyota Prius", car_color: "Blue", bio: "Demo administrator and volunteer driver." }),
    profile(p.driver, "Noah Levin", { neighborhood: "Oakland", car_make_model: "Silver Honda CR-V", car_color: "Silver" }),
    profile(p.rider, "Leah Kaplan", { neighborhood: "Berkeley" }),
    profile(p.reported, "Eli Rosen", { neighborhood: "Daly City" }),
    profile(p.reporter, "Rachel Stein", { neighborhood: "San Mateo" }),
    profile(p.warned, "Ari Weiss", { neighborhood: "Palo Alto" }),
    profile(p.banned, "Jonah Bloom", { neighborhood: "Walnut Creek" }),
  ]);
  const contacts = Object.fromEntries(Object.values(profiles).map((item, index) => [item.id, {
    profileId: item.id,
    phone: `+14155550${String(index + 1).padStart(3, "0")}`,
    whatsapp: null,
    homeAddress: ["3251 20th Ave, San Francisco, CA", "410 Grand Ave, Oakland, CA", "1820 Shattuck Ave, Berkeley, CA", "88 Hillside Blvd, Daly City, CA", "200 B St, San Mateo, CA", "3000 El Camino Real, Palo Alto, CA", "1350 N Broadway, Walnut Creek, CA"][index],
    homeLat: [37.728, 37.81, 37.875, 37.69, 37.568, 37.421, 37.9][index],
    homeLng: [-122.476, -122.249, -122.269, -122.466, -122.325, -122.142, -122.06][index],
  }]));
  const places = records([
    { id: "22000000-0000-4000-8000-000000000001", name: "JCNC", address: "3200 California St, San Francisco, CA", kind: "hub" as const, event_id: null, active: true, created_at: createdAt },
    { id: "22000000-0000-4000-8000-000000000002", name: "San Francisco", address: null, kind: "neighborhood" as const, event_id: null, active: true, created_at: createdAt },
    { id: "22000000-0000-4000-8000-000000000003", name: "Oakland", address: null, kind: "neighborhood" as const, event_id: null, active: true, created_at: createdAt },
    { id: "22000000-0000-4000-8000-000000000004", name: "Berkeley", address: null, kind: "neighborhood" as const, event_id: null, active: true, created_at: createdAt },
  ]);
  const events = records([
    { id: DEMO_IDS.events.shabbat, name: "Community Shabbat Dinner", slug: "community-shabbat-dinner", description: "Dinner and songs with the Bay Area community.", venue_label: "JCNC", start_date: at(seedDay, 5, 18), end_date: at(seedDay, 5, 21), source_url: null, is_active: true, created_by: p.admin, created_at: createdAt },
    { id: DEMO_IDS.events.festival, name: "Jewish Film Festival", slug: "jewish-film-festival", description: "Opening night screening.", venue_label: "San Francisco", start_date: at(seedDay, 12, 19), end_date: at(seedDay, 12, 22), source_url: null, is_active: true, created_by: p.admin, created_at: createdAt },
  ]);
  const eventRequests = records([
    { id: DEMO_IDS.eventRequests.pending, name: "Volunteer Day", description: "Community garden volunteering.", venue_label: "Oakland", start_date: at(seedDay, 18, 9), end_date: at(seedDay, 18, 14), source: "user" as const, source_url: null, expected_traffic: "high" as const, status: "pending" as const, requested_by: p.rider, reviewed_by: null, approved_event_id: null, reviewed_at: null, created_at: at(seedDay, -1) },
    { id: DEMO_IDS.eventRequests.approved, name: "Young Adults Picnic", description: null, venue_label: "Berkeley", start_date: at(seedDay, 9), end_date: at(seedDay, 9, 15), source: "user" as const, source_url: null, expected_traffic: "unsure" as const, status: "approved" as const, requested_by: p.reporter, reviewed_by: p.admin, approved_event_id: DEMO_IDS.events.festival, reviewed_at: at(seedDay, -2), created_at: at(seedDay, -4) },
    { id: DEMO_IDS.eventRequests.rejected, name: "Duplicate Dinner", description: null, venue_label: "JCNC", start_date: at(seedDay, 5), end_date: null, source: "user" as const, source_url: null, expected_traffic: "unsure" as const, status: "rejected" as const, requested_by: p.warned, reviewed_by: p.admin, approved_event_id: null, reviewed_at: at(seedDay, -1), created_at: at(seedDay, -3) },
    { id: DEMO_IDS.eventRequests.importCandidate, name: "JCNC Family Havdalah", description: "Baked demo import candidate.", venue_label: "JCNC", start_date: at(seedDay, 22, 18), end_date: at(seedDay, 22, 20), source: "jcnc" as const, source_url: null, expected_traffic: "high" as const, status: "pending" as const, requested_by: null, reviewed_by: null, approved_event_id: null, reviewed_at: null, created_at: at(seedDay, 0) },
  ]);
  const ride = (id: string, driverId: string, days: number, values: Record<string, unknown> = {}) => ({
    id,
    driver_id: driverId,
    origin_label: "San Francisco",
    destination_label: "JCNC",
    depart_at: at(seedDay, days, 17),
    round_trip: false,
    return_depart_at: null,
    return_notes: null,
    seats_total: 3,
    seats_available: 3,
    gas_contribution: 8,
    notes: "Meet by the main entrance.",
    event_id: null,
    status: "active" as const,
    cancellation_reason: null,
    created_at: at(seedDay, -2),
    meetupAddress: "3200 California St, San Francisco, CA",
    meetupLat: 37.787,
    meetupLng: -122.446,
    routeDistanceMiles: 4.8,
    routeDurationMinutes: 12,
    ...values,
  });
  const rides = records([
    ride(r.pending, p.admin, 3, { seats_available: 3 }),
    ride(r.reservable, p.driver, 4, { origin_label: "Oakland", routeDistanceMiles: 12.4, routeDurationMinutes: 24 }),
    ride(r.confirmed, p.driver, 6, { destination_label: "Berkeley", seats_available: 0, meetupAddress: "1820 Shattuck Ave, Berkeley, CA", routeDistanceMiles: 6.7, routeDurationMinutes: 17 }),
    ride(r.full, p.driver, 7, { seats_total: 2, seats_available: 0 }),
    ride(r.roundTrip, p.admin, 8, { round_trip: true, return_depart_at: at(seedDay, 8, 22), return_notes: "Leaving after cleanup.", event_id: DEMO_IDS.events.shabbat }),
    ride(r.cancelled, p.driver, 2, { status: "cancelled", cancellation_reason: "Car trouble" }),
    ride(r.completed, p.admin, -1, { status: "completed", seats_available: 1 }),
    ride(r.eventLinked, p.driver, 12, { event_id: DEMO_IDS.events.festival, destination_label: "Jewish Film Festival" }),
  ]);
  const request = (id: string, riderId: string, days: number, values: Record<string, unknown> = {}) => ({
    id,
    rider_id: riderId,
    origin_label: "Berkeley",
    destination_label: "JCNC",
    depart_at: at(seedDay, days, 17),
    earliest_date: at(seedDay, days, 8),
    latest_date: at(seedDay, days, 20),
    max_price: 15,
    seats_needed: 1,
    notes: "Flexible by about an hour.",
    event_id: null,
    status: "active" as const,
    accepted_driver_id: null,
    accepted_at: null,
    created_at: at(seedDay, -1),
    expired: false,
    ...values,
  });
  const rideRequests = records([
    request(q.available, p.rider, 5),
    request(q.own, p.admin, 10, { origin_label: "San Mateo" }),
    request(q.fulfilled, p.rider, 6, { status: "fulfilled", accepted_driver_id: p.admin, accepted_at: at(seedDay, -1) }),
    request(q.cancelled, p.reporter, 2, { status: "cancelled" }),
    request(q.expired, p.warned, -4, { expired: true }),
  ]);
  const passengers = records([
    { id: DEMO_IDS.passengers.pending, ride_id: r.pending, passenger_id: p.rider, status: "pending" as const, guest_count: 1, pickupLocation: contacts[p.rider].homeAddress, dropoffLocation: "3200 California St, San Francisco, CA", pickupNote: "Blue door", created_at: at(seedDay, -1) },
    { id: DEMO_IDS.passengers.confirmed, ride_id: r.confirmed, passenger_id: p.admin, status: "confirmed" as const, guest_count: 2, pickupLocation: contacts[p.admin].homeAddress, dropoffLocation: "1820 Shattuck Ave, Berkeley, CA", pickupNote: null, created_at: at(seedDay, -2) },
    { id: DEMO_IDS.passengers.declined, ride_id: r.reservable, passenger_id: p.reporter, status: "declined" as const, guest_count: 1, pickupLocation: contacts[p.reporter].homeAddress, dropoffLocation: null, pickupNote: null, created_at: at(seedDay, -3) },
    { id: DEMO_IDS.passengers.cancelled, ride_id: r.roundTrip, passenger_id: p.warned, status: "cancelled" as const, guest_count: 1, pickupLocation: contacts[p.warned].homeAddress, dropoffLocation: null, pickupNote: null, created_at: at(seedDay, -2) },
    { id: DEMO_IDS.passengers.full, ride_id: r.full, passenger_id: p.reported, status: "confirmed" as const, guest_count: 1, pickupLocation: contacts[p.reported].homeAddress, dropoffLocation: null, pickupNote: null, created_at: at(seedDay, -2) },
  ]);
  const conversations = records([
    { id: c.pending, participantIds: [p.admin, p.rider], rideId: r.pending, requestId: null, hiddenBy: [], createdAt: at(seedDay, -1) },
    { id: c.confirmed, participantIds: [p.driver, p.admin], rideId: r.confirmed, requestId: null, hiddenBy: [], createdAt: at(seedDay, -2) },
    { id: c.request, participantIds: [p.admin, p.rider], rideId: null, requestId: q.fulfilled, hiddenBy: [], createdAt: at(seedDay, -1) },
    { id: c.archived, participantIds: [p.admin, p.warned], rideId: r.completed, requestId: null, hiddenBy: [p.admin], createdAt: at(seedDay, -4) },
  ]);
  const messages = records([
    { id: "41000000-0000-4000-8000-000000000001", conversation_id: c.pending, sender_id: p.rider, body: "Hi Maya, I sent a ride request. My pickup is the blue door.", created_at: at(seedDay, -1, 13), read_at: null },
    { id: "41000000-0000-4000-8000-000000000002", conversation_id: c.confirmed, sender_id: p.driver, body: "I will arrive around 4:45. Look for the silver CR-V.", created_at: at(seedDay, -1, 14), read_at: null },
    { id: "41000000-0000-4000-8000-000000000003", conversation_id: c.request, sender_id: p.admin, body: "I can drive you. See you Friday!", created_at: at(seedDay, -1, 15), read_at: at(seedDay, -1, 16) },
    { id: "41000000-0000-4000-8000-000000000004", conversation_id: c.archived, sender_id: p.warned, body: "I think I left my scarf in your car.", created_at: at(seedDay, -1, 17), read_at: null },
  ]);
  const notificationTypes: NotificationType[] = ["seat_requested", "seat_confirmed", "seat_declined", "seat_cancelled", "ride_cancelled", "ride_completed", "request_accepted", "new_message", "event_request_approved", "event_request_rejected", "moderation_report_submitted"];
  const notifications = records(notificationTypes.map((type, index) => ({
    id: `42000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    recipient_id: index === 10 ? p.admin : p.admin,
    actor_id: index === 10 ? p.reporter : p.rider,
    type,
    ride_id: index <= 5 ? r.pending : null,
    request_id: index === 6 ? q.fulfilled : null,
    conversation_id: index === 7 ? c.confirmed : null,
    event_id: index === 8 || index === 9 ? DEMO_IDS.events.shabbat : null,
    report_id: index === 10 ? reports.userPending : null,
    message: `${type.replaceAll("_", " ")} demo notification`,
    read_at: index > 0 && index % 3 === 0 ? at(seedDay, -1, 18) : null,
    created_at: at(seedDay, -1, 18 - Math.min(index, 8)),
  })));
  const report = (id: string, targetType: "user" | "ride" | "ride_request" | "message", targetId: string, values: Record<string, unknown> = {}) => ({
    id,
    targetType,
    targetId,
    targetUserId: p.reported,
    reporterId: p.reporter,
    reason: "Unsafe or reckless driving",
    details: "A coherent demo report with preserved context.",
    status: "pending" as const,
    resolution: null,
    verdict: null,
    enforcement: null,
    verdictVersion: 0,
    banDays: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: at(seedDay, -5),
    ...values,
  });
  const reportRows = records([
    report(reports.userPending, "user", p.reported),
    report(reports.rideReviewing, "ride", r.reservable, { status: "reviewing", targetUserId: p.driver }),
    report(reports.requestRevisable, "ride_request", q.cancelled, { status: "dismissed", resolution: "No violation found.", verdict: "no_violation", enforcement: "none", verdictVersion: 1, targetUserId: p.reporter, reviewedBy: p.admin, reviewedAt: at(seedDay, -2) }),
    report(reports.messageWarning, "message", "41000000-0000-4000-8000-000000000004", { status: "actioned", resolution: "Warning issued.", verdict: "violation", enforcement: "warn_reported", verdictVersion: 1, targetUserId: p.warned, reviewedBy: p.admin, reviewedAt: at(seedDay, -3) }),
    report(reports.temporaryBan, "user", p.banned, { status: "actioned", resolution: "Temporary suspension.", verdict: "violation", enforcement: "temporary_ban", verdictVersion: 1, banDays: 7, targetUserId: p.banned, reviewedBy: p.admin, reviewedAt: at(seedDay, -2) }),
    report(reports.permanentBan, "user", p.reported, { status: "actioned", resolution: "Permanent suspension.", verdict: "violation", enforcement: "permanent_ban", verdictVersion: 1, reviewedBy: p.admin, reviewedAt: at(seedDay, -10) }),
    report(reports.dismissed, "user", p.reporter, { status: "dismissed", resolution: "Report not substantiated.", verdict: "no_violation", enforcement: "none", verdictVersion: 1, targetUserId: p.reporter, reviewedBy: p.admin, reviewedAt: at(seedDay, -7) }),
    report(reports.inconclusive, "message", "41000000-0000-4000-8000-000000000003", { status: "dismissed", resolution: "Not enough evidence.", verdict: "inconclusive", enforcement: "none", verdictVersion: 1, targetUserId: p.admin, reviewedBy: p.admin, reviewedAt: at(seedDay, -8) }),
  ]);
  const evidence = Object.fromEntries(Object.values(reportRows).map((item) => [item.id, {
    reportId: item.id,
    version: item.verdictVersion,
    snapshot: {
      targetType: item.targetType,
      targetId: item.targetId,
      details: item.details,
      messageContext: item.targetType === "message" ? [messages[item.targetId]] : null,
    },
  }]));
  const moderationActions = records([
    { id: "53000000-0000-4000-8000-000000000001", reportId: reports.messageWarning, actorId: p.admin, userId: p.warned, action: "warning", detail: { note: "Please keep messages respectful." }, createdAt: at(seedDay, -3) },
    { id: "53000000-0000-4000-8000-000000000002", reportId: reports.temporaryBan, actorId: p.admin, userId: p.banned, action: "ban", detail: { days: 7 }, createdAt: at(seedDay, -2) },
    { id: "53000000-0000-4000-8000-000000000003", reportId: reports.requestRevisable, actorId: p.admin, userId: p.reporter, action: "report_status", detail: { verdict: "no_violation", enforcement: "none" }, createdAt: at(seedDay, -2) },
    { id: "53000000-0000-4000-8000-000000000004", reportId: reports.dismissed, actorId: p.admin, userId: p.reporter, action: "appeal_resolved", detail: { appealId: DEMO_IDS.appeals.resolved, decision: "granted", banId: DEMO_IDS.bans.compensated }, createdAt: at(seedDay, -4) },
  ]);
  const warnings = records([{ id: "54000000-0000-4000-8000-000000000001", reportId: reports.messageWarning, userId: p.warned, note: "Please keep messages respectful.", outcomeId: "57000000-0000-4000-8000-000000000001", createdAt: at(seedDay, -3) }]);
  const bans = records([
    { id: DEMO_IDS.bans.temporary, reportId: reports.temporaryBan, userId: p.banned, reason: "Temporary demo ban", expiresAt: at(seedDay, 5), liftedAt: null, compensatedAt: null, createdAt: at(seedDay, -2) },
    { id: DEMO_IDS.bans.permanent, reportId: reports.permanentBan, userId: p.reported, reason: "Permanent demo ban", expiresAt: null, liftedAt: null, compensatedAt: null, createdAt: at(seedDay, -10) },
    { id: DEMO_IDS.bans.compensated, reportId: reports.dismissed, userId: p.reporter, reason: "Compensated demo ban", expiresAt: at(seedDay, 7), liftedAt: at(seedDay, -4), compensatedAt: at(seedDay, -4), createdAt: at(seedDay, -6) },
  ]);
  const appeals = records([
    { id: DEMO_IDS.appeals.pending, banId: DEMO_IDS.bans.temporary, userId: p.banned, text: "Please review the route context.", status: "pending" as const, resolvedAt: null, createdAt: at(seedDay, -1) },
    { id: DEMO_IDS.appeals.resolved, banId: DEMO_IDS.bans.compensated, userId: p.reporter, text: "This was a misunderstanding.", status: "granted" as const, resolvedAt: at(seedDay, -4), createdAt: at(seedDay, -5) },
  ]);
  const outcomes = records([
    { id: "57000000-0000-4000-8000-000000000001", userId: p.warned, reportId: reports.messageWarning, type: "warning" as const, sourceActionId: "53000000-0000-4000-8000-000000000001", acknowledgedAt: null, createdAt: at(seedDay, -3) },
    { id: "57000000-0000-4000-8000-000000000002", userId: p.banned, reportId: reports.temporaryBan, type: "ban" as const, sourceActionId: "53000000-0000-4000-8000-000000000002", acknowledgedAt: at(seedDay, -1), createdAt: at(seedDay, -2) },
    { id: "57000000-0000-4000-8000-000000000003", userId: p.reporter, reportId: reports.dismissed, type: "appeal_granted" as const, sourceActionId: "53000000-0000-4000-8000-000000000004", acknowledgedAt: null, createdAt: at(seedDay, -4) },
  ]);
  return {
    seedDay,
    now: at(seedDay, 0, 12),
    activeActorId: p.admin,
    scenario: "baseline",
    counters: {},
    profiles,
    contacts,
    places,
    events,
    eventRequests,
    rides,
    rideRequests,
    passengers,
    conversations,
    messages,
    notifications,
    reports: reportRows,
    evidence,
    evidenceReceipts: {},
    moderationActions,
    warnings,
    bans,
    appeals,
    outcomes,
  };
}

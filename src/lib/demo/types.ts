import type {
  EventRequest,
  EventRow,
  Message,
  Notification,
  Place,
  Profile,
  Ride,
  RidePassenger,
  RideRequest,
} from "../types";
import type {
  AdminEnforcement,
  AdminVerdict,
} from "../admin-moderation";
import type { ReportTargetType } from "../moderation";

export type DemoScenario = "baseline" | "empty" | "incomplete_profile" | "maps_unavailable" | "read_error";
export type DemoOwnerKind = "admin" | "local";

export type DemoContact = {
  profileId: string;
  phone: string | null;
  whatsapp: string | null;
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
};

export type DemoRide = Ride & {
  meetupAddress: string;
  meetupLat: number;
  meetupLng: number;
  routeDistanceMiles: number;
  routeDurationMinutes: number;
};

export type DemoRideRequest = RideRequest & { expired: boolean };

export type DemoPassenger = RidePassenger & {
  pickupLocation: string | null;
  dropoffLocation: string | null;
  pickupNote: string | null;
};

export type DemoConversation = {
  id: string;
  participantIds: string[];
  rideId: string | null;
  requestId: string | null;
  hiddenBy: string[];
  createdAt: string;
};

export type DemoReport = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string | null;
  reporterId: string;
  reason: string;
  details: string | null;
  status: "pending" | "reviewing" | "actioned" | "dismissed";
  resolution: string | null;
  verdict: AdminVerdict | null;
  enforcement: AdminEnforcement | null;
  verdictVersion: number;
  banDays: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type DemoEvidence = {
  reportId: string;
  version: number;
  snapshot: Record<string, unknown>;
};

export type DemoEvidenceReceipt = {
  id: string;
  reportId: string;
  reportVersion: number;
  adminId: string;
  createdAt: string;
};

export type DemoModerationAction = {
  id: string;
  reportId: string | null;
  actorId: string | null;
  userId: string | null;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type DemoWarning = {
  id: string;
  reportId: string;
  userId: string;
  note: string;
  outcomeId: string;
  createdAt: string;
};

export type DemoBan = {
  id: string;
  reportId: string;
  userId: string;
  reason: string;
  expiresAt: string | null;
  liftedAt: string | null;
  compensatedAt: string | null;
  createdAt: string;
};

export type DemoAppeal = {
  id: string;
  banId: string;
  userId: string;
  text: string;
  status: "pending" | "granted" | "denied";
  resolvedAt: string | null;
  createdAt: string;
};

export type DemoOutcome = {
  id: string;
  userId: string;
  reportId: string | null;
  type: "warning" | "ban" | "unban" | "appeal_granted" | "appeal_denied";
  sourceActionId: string;
  acknowledgedAt: string | null;
  createdAt: string;
};

export type DemoState = {
  seedDay: string;
  now: string;
  activeActorId: string;
  scenario: DemoScenario;
  counters: Record<string, number>;
  profiles: Record<string, Profile>;
  contacts: Record<string, DemoContact>;
  places: Record<string, Place>;
  events: Record<string, EventRow>;
  eventRequests: Record<string, EventRequest>;
  rides: Record<string, DemoRide>;
  rideRequests: Record<string, DemoRideRequest>;
  passengers: Record<string, DemoPassenger>;
  conversations: Record<string, DemoConversation>;
  messages: Record<string, Message>;
  notifications: Record<string, Notification>;
  reports: Record<string, DemoReport>;
  evidence: Record<string, DemoEvidence>;
  evidenceReceipts: Record<string, DemoEvidenceReceipt>;
  moderationActions: Record<string, DemoModerationAction>;
  warnings: Record<string, DemoWarning>;
  bans: Record<string, DemoBan>;
  appeals: Record<string, DemoAppeal>;
  outcomes: Record<string, DemoOutcome>;
};

export type DemoSession = {
  id: string;
  ownerKind: DemoOwnerKind;
  ownerId: string;
  activeActorId: string;
  seedDay: string;
  revision: number;
  state: DemoState;
  expiresAt: string;
};

export type DemoCommand =
  | { type: "switch_actor"; actorId: string }
  | { type: "set_scenario"; scenario: DemoScenario }
  | { type: "post_ride"; actorId: string; input: Omit<DemoRide, "id" | "driver_id" | "created_at" | "status" | "cancellation_reason"> }
  | { type: "cancel_ride"; actorId: string; rideId: string; reason: string }
  | { type: "close_ride"; actorId: string; rideId: string }
  | { type: "post_request"; actorId: string; input: Omit<DemoRideRequest, "id" | "rider_id" | "created_at" | "status" | "accepted_driver_id" | "accepted_at" | "expired"> }
  | { type: "cancel_request"; actorId: string; requestId: string }
  | { type: "accept_request"; actorId: string; requestId: string }
  | { type: "request_seat"; actorId: string; rideId: string; guestCount: number; pickupLocation: string; dropoffLocation?: string | null; pickupNote?: string | null }
  | { type: "set_passenger_status"; actorId: string; passengerId: string; status: "confirmed" | "declined" }
  | { type: "cancel_seat"; actorId: string; passengerId: string }
  | { type: "open_conversation"; actorId: string; otherUserId: string; rideId?: string | null; requestId?: string | null }
  | { type: "hide_conversation"; actorId: string; conversationId: string }
  | { type: "send_message"; actorId: string; conversationId: string; body: string; clientMessageId: string }
  | { type: "read_messages"; actorId: string; conversationId: string }
  | { type: "mark_notification"; actorId: string; notificationId: string }
  | { type: "mark_all_notifications"; actorId: string }
  | { type: "update_profile"; actorId: string; values: Partial<Pick<Profile, "full_name" | "avatar_url" | "neighborhood" | "instagram" | "pronouns" | "preferred_contact" | "car_make_model" | "car_color" | "bio">> }
  | { type: "update_contact"; actorId: string; values: Partial<Omit<DemoContact, "profileId">> }
  | { type: "suggest_event"; actorId: string; input: Pick<EventRequest, "name" | "description" | "venue_label" | "start_date" | "end_date" | "expected_traffic"> }
  | { type: "create_event"; actorId: string; input: Omit<EventRow, "id" | "created_by" | "created_at"> }
  | { type: "delete_event"; actorId: string; eventId: string }
  | { type: "create_place"; actorId: string; input: Omit<Place, "id" | "created_at"> }
  | { type: "delete_place"; actorId: string; placeId: string }
  | { type: "review_event_request"; actorId: string; requestId: string; decision: "approved" | "rejected" }
  | { type: "delete_event_request"; actorId: string; requestId: string }
  | { type: "import_events"; actorId: string }
  | { type: "submit_report"; actorId: string; targetType: ReportTargetType; targetId: string; targetUserId: string | null; reason: string; details: string | null }
  | { type: "reveal_evidence"; actorId: string; reportId: string }
  | { type: "close_report"; actorId: string; reportId: string; expectedVersion: number; receiptId: string; verdict: AdminVerdict; enforcement: AdminEnforcement; resolution: string; banDays?: 1 | 7 | 30 }
  | { type: "revise_report"; actorId: string; reportId: string; expectedVersion: number; receiptId: string; verdict: AdminVerdict; enforcement: AdminEnforcement; resolution: string; banDays?: 1 | 7 | 30 }
  | { type: "compensate_ban"; actorId: string; banId: string; reason: string }
  | { type: "submit_appeal"; actorId: string; banId: string; text: string }
  | { type: "resolve_appeal"; actorId: string; appealId: string; decision: "granted" | "denied" }
  | { type: "acknowledge_outcome"; actorId: string; outcomeId: string };

export type DemoMutationResult = {
  state: DemoState;
  value?: string | number | boolean | Record<string, unknown> | null;
};

export class DemoDomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DemoDomainError";
  }
}

export class DemoRevisionError extends Error {
  constructor(public readonly actualRevision: number) {
    super(`Demo session changed at revision ${actualRevision}`);
    this.name = "DemoRevisionError";
  }
}

// Hand-maintained types mirroring supabase/migrations/0001_init.sql.
// After connecting a real project you can regenerate with:
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  neighborhood: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  pronouns: string | null;
  preferred_contact: "phone" | "whatsapp" | "message" | null;
  car_make_model: string | null;
  car_color: string | null;
  bio: string | null;
  is_admin: boolean;
  created_at: string;
};

export type EventRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  venue_label: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export type EventRequest = {
  id: string;
  name: string;
  description: string | null;
  venue_label: string | null;
  start_date: string | null;
  end_date: string | null;
  source: "user" | "jcnc";
  source_url: string | null;
  expected_traffic: "unsure" | "high";
  status: "pending" | "approved" | "rejected";
  requested_by: string | null;
  reviewed_by: string | null;
  approved_event_id: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type EventRequestWithRequester = EventRequest & {
  requester: Pick<Profile, "id" | "full_name"> | null;
};

export type Place = {
  id: string;
  name: string;
  address: string | null;
  kind: "hub" | "event" | "neighborhood";
  event_id: string | null;
  active: boolean;
  created_at: string;
};

export type RideStatus = "active" | "cancelled" | "completed";

export type Ride = {
  id: string;
  driver_id: string;
  origin_label: string;
  destination_label: string;
  pickup_location: string | null;
  dropoff_location: string | null;
  depart_at: string;
  round_trip: boolean;
  return_depart_at: string | null;
  return_notes: string | null;
  seats_total: number;
  seats_available: number;
  gas_contribution: number | null;
  notes: string | null;
  event_id: string | null;
  status: RideStatus;
  cancellation_reason: string | null;
  created_at: string;
};

export type RideRequest = {
  id: string;
  rider_id: string;
  origin_label: string;
  destination_label: string;
  depart_at: string;
  earliest_date: string | null;
  latest_date: string | null;
  max_price: number | null;
  seats_needed: number;
  notes: string | null;
  event_id: string | null;
  status: "active" | "fulfilled" | "cancelled";
  accepted_driver_id: string | null;
  accepted_at: string | null;
  created_at: string;
};

export type PassengerStatus = "pending" | "confirmed" | "declined";

export type RidePassenger = {
  id: string;
  ride_id: string;
  passenger_id: string;
  status: PassengerStatus;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type NotificationType =
  | "seat_requested"
  | "seat_confirmed"
  | "seat_declined"
  | "seat_cancelled"
  | "ride_cancelled"
  | "request_accepted"
  | "new_message";

export type Notification = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  ride_id: string | null;
  request_id: string | null;
  conversation_id: string | null;
  message: string | null;
  read_at: string | null;
  created_at: string;
};

// Notification joined with the actor profile and a little ride context.
export type NotificationWithContext = Notification & {
  actor: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
  ride: Pick<Ride, "id" | "origin_label" | "destination_label" | "depart_at" | "status"> | null;
  request: Pick<RideRequest, "id" | "origin_label" | "destination_label" | "depart_at" | "status"> | null;
};

// Common joined shapes used in the UI.
export type RideWithDriver = Ride & {
  driver: Profile | null;
  event: Pick<EventRow, "id" | "name" | "slug"> | null;
};

export type RideRequestWithRider = RideRequest & {
  rider: Profile | null;
  event: Pick<EventRow, "id" | "name" | "slug"> | null;
};

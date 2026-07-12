import { format } from "date-fns";
import type { createClient } from "@/lib/supabase/server";
import type { EventRow, RideRequestWithRider, RideWithDriver } from "@/lib/types";
import { throwReadError } from "@/lib/supabase/read-error";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type EventCardEvent = Pick<
  EventRow,
  "id" | "name" | "slug" | "description" | "venue_label" | "start_date" | "end_date"
> & {
  is_active?: boolean;
  created_at?: string;
  created_by?: string | null;
};

export type EventStats = {
  rides: number;
  seats: number;
  requests: number | null;
};

export type EventSummary = {
  event: EventCardEvent;
  stats: EventStats;
};

type PublicEventRpcRow = EventCardEvent & {
  is_active: boolean;
  created_at: string;
  ride_count: number;
  seats_available: number;
};

type PublicRideCountRow = {
  event_id: string | null;
  seats_available: number | null;
};

export type EventBoard = {
  event: EventCardEvent;
  rides: RideWithDriver[];
  requests: RideRequestWithRider[];
  stats: EventStats;
  publicOnly: boolean;
};

function dateOnlyAtLocalNoon(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function formatEventDateRange(startDate: string, endDate: string | null): string {
  const start = dateOnlyAtLocalNoon(startDate);
  if (!endDate || endDate === startDate) {
    return format(start, "MMMM d, yyyy");
  }
  return `${format(start, "MMM d")} – ${format(dateOnlyAtLocalNoon(endDate), "MMM d, yyyy")}`;
}

export function formatEventDateShort(event: Pick<EventCardEvent, "start_date" | "end_date" | "venue_label">) {
  if (!event.start_date) return event.venue_label ?? "";
  const start = format(dateOnlyAtLocalNoon(event.start_date), "MMM d");
  if (!event.end_date || event.end_date === event.start_date) return start;
  return `${start} – ${format(dateOnlyAtLocalNoon(event.end_date), "MMM d")}`;
}

export function filterPublicUpcomingEvents<
  T extends { is_active: boolean; start_date: string | null; end_date: string | null },
>(events: T[], currentDate = new Date().toISOString().slice(0, 10)): T[] {
  return events.filter((event) => {
    if (!event.is_active) return false;
    const lastDate = event.end_date ?? event.start_date;
    return Boolean(lastDate && lastDate >= currentDate);
  });
}

export function summarizePublicRideCounts(rows: PublicRideCountRow[]) {
  const stats = new Map<string, { rides: number; seats: number }>();
  for (const row of rows) {
    if (!row.event_id) continue;
    const current = stats.get(row.event_id) ?? { rides: 0, seats: 0 };
    current.rides += 1;
    current.seats += row.seats_available ?? 0;
    stats.set(row.event_id, current);
  }
  return stats;
}

export function eventStatsAreEmpty(stats: EventStats) {
  return stats.rides === 0 && stats.seats === 0 && (stats.requests ?? 0) === 0;
}

function requestIsUpcoming(request: Pick<RideRequestWithRider, "depart_at" | "latest_date">, today: string) {
  return (request.latest_date ?? request.depart_at.slice(0, 10)) >= today;
}

function summariesFromStats(events: EventCardEvent[], stats: Map<string, EventStats>) {
  return events.map((event) => ({
    event,
    stats: stats.get(event.id) ?? { rides: 0, seats: 0, requests: null },
  }));
}

export async function loadEventSummaries(
  supabase: ServerClient,
  signedIn: boolean,
): Promise<EventSummary[]> {
  if (!signedIn) {
    const { data, error } = await supabase.rpc("public_upcoming_events");
    throwReadError(error, "events");
    const events = ((data as PublicEventRpcRow[]) ?? []).map((event) => ({
      id: event.id,
      name: event.name,
      slug: event.slug,
      description: event.description,
      venue_label: event.venue_label,
      start_date: event.start_date,
      end_date: event.end_date,
      is_active: event.is_active,
      created_at: event.created_at,
    }));
    const stats = new Map<string, EventStats>();
    for (const event of (data as PublicEventRpcRow[]) ?? []) {
      stats.set(event.id, {
        rides: Number(event.ride_count ?? 0),
        seats: Number(event.seats_available ?? 0),
        requests: null,
      });
    }
    return summariesFromStats(events, stats);
  }

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const [eventsResult, ridesResult, requestsResult] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("start_date", { ascending: true }),
    supabase
      .from("rides")
      .select("event_id, seats_available")
      .eq("status", "active")
      .gte("depart_at", nowIso)
      .not("event_id", "is", null),
    supabase
      .from("ride_requests")
      .select("event_id, depart_at, latest_date")
      .eq("status", "active")
      .not("event_id", "is", null),
  ]);
  throwReadError(eventsResult.error, "events");
  throwReadError(ridesResult.error, "event rides");
  throwReadError(requestsResult.error, "event ride requests");
  const events = eventsResult.data;
  const rides = ridesResult.data;
  const requests = requestsResult.data;

  const list = filterPublicUpcomingEvents((events as EventRow[]) ?? [], today);
  const stats = new Map<string, EventStats>();
  for (const event of list) stats.set(event.id, { rides: 0, seats: 0, requests: 0 });
  for (const ride of (rides as PublicRideCountRow[]) ?? []) {
    if (!ride.event_id) continue;
    const current = stats.get(ride.event_id);
    if (!current) continue;
    current.rides += 1;
    current.seats += ride.seats_available ?? 0;
  }
  for (const request of (requests as RideRequestWithRider[]) ?? []) {
    if (!request.event_id || !requestIsUpcoming(request, today)) continue;
    const current = stats.get(request.event_id);
    if (current) current.requests = (current.requests ?? 0) + 1;
  }

  return summariesFromStats(list, stats);
}

export async function loadEventBoard(
  supabase: ServerClient,
  slug: string,
  signedIn: boolean,
): Promise<EventBoard | null> {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  if (!signedIn) {
    const { data: event, error: eventError } = await supabase
      .rpc("public_event_board", { p_slug: slug })
      .maybeSingle<PublicEventRpcRow>();
    throwReadError(eventError, "event");
    if (!event) return null;

    const { data: publicRides, error: ridesError } = await supabase.rpc(
      "public_event_rides",
      { p_slug: slug, p_limit: 100 },
    );
    throwReadError(ridesError, "event rides");
    const rides = (publicRides as RideWithDriver[]) ?? [];
    return {
      event,
      rides,
      requests: [],
      stats: {
        rides: Number(event.ride_count ?? 0),
        seats: Number(event.seats_available ?? 0),
        requests: null,
      },
      publicOnly: true,
    };
  }

  const { data: rawEvent, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle<EventRow>();
  throwReadError(eventError, "event");
  const event = filterPublicUpcomingEvents(rawEvent ? [rawEvent] : [], today)[0];
  if (!event) return null;

  const { data: rides, error: ridesError } = await supabase
    .from("rides")
    .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
    .eq("event_id", event.id)
    .eq("status", "active")
    .gte("depart_at", nowIso)
    .order("depart_at", { ascending: true });
  throwReadError(ridesError, "event rides");

  const { data: requests, error: requestsError } = await supabase
    .from("ride_requests")
    .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
    .eq("event_id", event.id)
    .eq("status", "active")
    .order("depart_at", { ascending: true });
  throwReadError(requestsError, "event ride requests");

  return {
    event,
    rides: (rides as RideWithDriver[]) ?? [],
    requests: ((requests as RideRequestWithRider[]) ?? []).filter((request) =>
      requestIsUpcoming(request, today),
    ),
    stats: {
      rides: ((rides as RideWithDriver[]) ?? []).length,
      seats: ((rides as RideWithDriver[]) ?? []).reduce(
        (total, ride) => total + ride.seats_available,
        0,
      ),
      requests: ((requests as RideRequestWithRider[]) ?? []).filter((request) =>
        requestIsUpcoming(request, today),
      ).length,
    },
    publicOnly: false,
  };
}

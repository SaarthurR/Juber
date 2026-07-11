import { format } from "date-fns";
import type { createClient } from "@/lib/supabase/server";
import type { EventRow, RideRequestWithRider, RideWithDriver } from "@/lib/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type EventBoard = {
  event: EventRow;
  rides: RideWithDriver[];
  requests: RideRequestWithRider[];
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

export async function loadEventBoard(
  supabase: ServerClient,
  slug: string,
): Promise<EventBoard | null> {
  const { data: event } = await supabase.from("events").select("*").eq("slug", slug).single<EventRow>();
  if (!event) return null;

  const { data: rides } = await supabase
    .from("rides")
    .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
    .eq("event_id", event.id)
    .eq("status", "active")
    .order("depart_at", { ascending: true });

  const { data: requests } = await supabase
    .from("ride_requests")
    .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
    .eq("event_id", event.id)
    .eq("status", "active")
    .order("depart_at", { ascending: true });

  return {
    event,
    rides: (rides as RideWithDriver[]) ?? [],
    requests: (requests as RideRequestWithRider[]) ?? [],
  };
}

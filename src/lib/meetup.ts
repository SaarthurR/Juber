import "server-only";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type MeetupRow = {
  pickup_location: string | null;
  dropoff_location: string | null;
  pickup_note: string | null;
  passenger_id: string | null;
};

export async function getRideMeetup(
  supabase: ServerClient,
  rideId: string,
): Promise<MeetupRow[]> {
  const { data, error } = await supabase.rpc("ride_meetup_location", {
    p_ride_id: rideId,
  });
  if (error) {
    console.error("ride_meetup_location failed", { code: error.code, rideId });
    return [];
  }
  return (data as MeetupRow[] | null) ?? [];
}

export function meetupForPassenger(rows: MeetupRow[], passengerId: string) {
  return rows.find((row) => row.passenger_id === passengerId) ?? null;
}

export function driverMeetup(rows: MeetupRow[]) {
  return rows[0] ?? null;
}

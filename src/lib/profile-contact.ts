import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type BookingRow = { ride: { id: string; driver_id: string; status: string } | null };

export async function getProfileContactContext(
  supabase: ServerClient,
  viewerId: string | null | undefined,
  profileId: string,
): Promise<{ canViewContact: boolean; messagingRideId: string | null }> {
  if (!viewerId) return { canViewContact: false, messagingRideId: null };
  if (viewerId === profileId) return { canViewContact: true, messagingRideId: null };

  const [{ data: userPassengerRows }, { data: profilePassengerRows }] = await Promise.all([
    supabase
      .from("ride_passengers")
      .select("ride:rides!ride_passengers_ride_id_fkey(id,driver_id,status)")
      .eq("passenger_id", viewerId)
      .eq("status", "confirmed"),
    supabase
      .from("ride_passengers")
      .select("ride:rides!ride_passengers_ride_id_fkey(id,driver_id,status)")
      .eq("passenger_id", profileId)
      .eq("status", "confirmed"),
  ]);

  const userBooking = ((userPassengerRows as BookingRow[] | null) ?? []).find(
    (row) => row.ride?.driver_id === profileId && row.ride.status === "active",
  );
  const profileBooking = ((profilePassengerRows as BookingRow[] | null) ?? []).find(
    (row) => row.ride?.driver_id === viewerId && row.ride.status === "active",
  );

  return {
    canViewContact: Boolean(userBooking),
    messagingRideId: userBooking?.ride?.id ?? profileBooking?.ride?.id ?? null,
  };
}

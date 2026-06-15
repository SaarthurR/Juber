import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, ArrowRight, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { ShareButton } from "@/components/share-button";
import { GoogleSignInButton } from "@/components/auth-button";
import { requestSeat, setPassengerStatus, cancelRide } from "@/app/rides/actions";
import { ContactModal } from "@/components/contact-modal";
import type { Profile, Ride, RidePassenger } from "@/lib/types";

export const dynamic = "force-dynamic";

type PassengerRow = RidePassenger & { passenger: Profile | null };

export default async function RideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getCurrentUser();
  const supabase = await createClient();

  const { data: ride } = await supabase
    .from("rides")
    .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
    .eq("id", id)
    .single<Ride & { driver: Profile | null; event: { id: string; name: string; slug: string } | null }>();

  if (!ride) notFound();

  const { data: passengers } = await supabase
    .from("ride_passengers")
    .select("*, passenger:profiles!ride_passengers_passenger_id_fkey(*)")
    .eq("ride_id", id);

  const passengerRows = (passengers as PassengerRow[]) ?? [];
  const isDriver = user?.id === ride.driver_id;
  const myJoin = passengerRows.find((p) => p.passenger_id === user?.id);
  const confirmed = passengerRows.filter((p) => p.status === "confirmed");

  const price = ride.gas_contribution
    ? `$${Number(ride.gas_contribution).toFixed(0)}`
    : "Free";

  return (
    <div>
      {/* Header */}
      <div className="mx-auto flex max-w-4xl items-start justify-between gap-4 px-4 pt-8 sm:px-6">
        <div className="flex items-start gap-4">
          <Link
            href="/rides"
            aria-label="Back to rides"
            className="mt-1 text-stone-700 transition hover:text-brand-600"
          >
            <ArrowLeft size={26} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Trip Details</h1>
            <p className="mt-1 flex items-center gap-2 text-stone-500">
              {ride.origin_label} <ArrowRight size={16} /> {ride.destination_label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-3xl font-bold text-stone-900">{price}</span>
          <ShareButton title={`${ride.origin_label} → ${ride.destination_label}`} />
        </div>
      </div>

      {/* Dark band: date + pickup/dropoff */}
      <div className="mt-6 bg-stone-900 text-white">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <p className="text-sm font-bold uppercase tracking-wide">
            {format(new Date(ride.depart_at), "EEEE, MMM d hh:mm a")}
          </p>
          <div className="mt-4 flex gap-4">
            <div className="flex flex-col items-center py-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-white bg-transparent" />
              <span className="my-1 w-0.5 flex-1 bg-white/60" />
              <span className="h-3 w-3 rounded-full bg-white" />
            </div>
            <div className="flex flex-1 flex-col justify-between gap-3 text-[15px]">
              <p>
                <span className="font-bold">Pick Up:</span> {ride.origin_label}
              </p>
              <p>
                <span className="font-bold">Drop off:</span> {ride.destination_label}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {ride.event && (
          <Link
            href={`/events/${ride.event.slug}`}
            className="mb-6 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
          >
            {ride.event.name}
          </Link>
        )}

        {/* Driver */}
        <p className="font-bold text-stone-900">Driver:</p>
        <div className="mt-3 flex items-center justify-between">
          <Link href={`/profile/${ride.driver_id}`} className="flex items-center gap-3">
            <Avatar src={ride.driver?.avatar_url} name={ride.driver?.full_name} size={40} />
            <span className="font-bold text-stone-900">
              {ride.driver?.full_name?.split(" ")[0] ?? "Driver"}
            </span>
          </Link>
          {user && !isDriver && (
            <ContactModal
              driverName={ride.driver?.full_name?.split(" ")[0] ?? "Driver"}
              phone={ride.driver?.phone ?? null}
              instagram={(ride.driver as any)?.instagram ?? null}
              preferredContact={(ride.driver as any)?.preferred_contact ?? null}
              rideId={ride.id}
              driverId={ride.driver_id}
            />
          )}
        </div>

        {/* Note */}
        <p className="mt-8 font-bold text-stone-900">Note:</p>
        <div className="mt-3 rounded-lg bg-stone-100 p-4 text-sm text-stone-700">
          {ride.notes || "No additional notes."}
        </div>

        {/* Going */}
        <div className="mt-8 flex items-center justify-between">
          <p className="font-bold text-stone-900">Going:</p>
          <p className="text-sm italic text-stone-500">
            {confirmed.length}/{ride.seats_total}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirmed.map((p) => (
            <Avatar
              key={p.id}
              src={p.passenger?.avatar_url}
              name={p.passenger?.full_name}
              size={36}
            />
          ))}
          {Array.from({ length: Math.max(0, ride.seats_total - confirmed.length) }).map(
            (_, i) => (
              <span
                key={i}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-brand-300"
              >
                <User size={20} />
              </span>
            ),
          )}
        </div>

        {/* Action */}
        <div className="mt-8">
          {!user ? (
            <GoogleSignInButton
              label="Sign in to reserve a seat"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-4 text-base font-bold text-white transition hover:bg-brand-700"
            />
          ) : isDriver ? (
            <DriverPanel ride={ride} passengerRows={passengerRows} />
          ) : myJoin ? (
            <div className="rounded-lg bg-stone-100 px-6 py-4 text-center text-base font-bold text-stone-600">
              Seat {myJoin.status}
            </div>
          ) : ride.seats_available > 0 ? (
            <form action={requestSeat.bind(null, ride.id)}>
              <button className="w-full rounded-lg bg-brand-600 px-6 py-4 text-base font-bold text-white transition hover:bg-brand-700">
                Reserve a seat
              </button>
            </form>
          ) : (
            <div className="rounded-lg bg-stone-100 px-6 py-4 text-center text-base font-bold text-stone-500">
              This ride is full
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DriverPanel({
  ride,
  passengerRows,
}: {
  ride: Ride;
  passengerRows: PassengerRow[];
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-500">
        Seat requests
      </h2>
      {passengerRows.length === 0 ? (
        <p className="text-sm text-stone-500">No requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {passengerRows.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar src={p.passenger?.avatar_url} name={p.passenger?.full_name} size={36} />
                <div>
                  <p className="text-sm font-medium">{p.passenger?.full_name}</p>
                  <p className="text-xs text-stone-500">{p.status}</p>
                </div>
              </div>
              {p.status === "pending" && (
                <div className="flex gap-2">
                  <form action={setPassengerStatus.bind(null, p.id, ride.id, "confirmed")}>
                    <button className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                      Confirm
                    </button>
                  </form>
                  <form action={setPassengerStatus.bind(null, p.id, ride.id, "declined")}>
                    <button className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50">
                      Decline
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form action={cancelRide.bind(null, ride.id)} className="mt-5">
        <button className="text-sm font-medium text-red-600 hover:underline">
          Cancel this ride
        </button>
      </form>
    </div>
  );
}

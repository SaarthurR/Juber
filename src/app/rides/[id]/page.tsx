import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Ban, ArrowLeftRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatRideDateTime } from "@/lib/date-time";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { ShareButton } from "@/components/share-button";
import { GoogleSignInButton } from "@/components/auth-button";
import { ContactModal } from "@/components/contact-modal";
import { getContact } from "@/lib/contact";
import {
  ReserveSeatButton,
  PassengerStatusButtons,
  CancelSeatButton,
  DriverRideActions,
} from "@/components/ride-actions";
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

  let passengerRows = (passengers as PassengerRow[]) ?? [];
  const missingProfileIds = passengerRows
    .filter((p) => !p.passenger && p.passenger_id)
    .map((p) => p.passenger_id);
  if (missingProfileIds.length) {
    const { data: fallbackProfiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", missingProfileIds);
    const profilesById = new Map(
      ((fallbackProfiles as Profile[] | null) ?? []).map((profile) => [profile.id, profile]),
    );
    passengerRows = passengerRows.map((p) => ({
      ...p,
      passenger: p.passenger ?? profilesById.get(p.passenger_id) ?? null,
    }));
  }
  const isDriver = user?.id === ride.driver_id;
  const myJoin = passengerRows.find((p) => p.passenger_id === user?.id);
  const confirmed = passengerRows.filter((p) => p.status === "confirmed");
  const confirmedCount = Math.max(
    confirmed.length,
    ride.seats_total - ride.seats_available,
  );

  // phone/whatsapp aren't on the profile join anymore (column-level RLS); read
  // the driver's numbers through the booking-scoped RPC, only when entitled.
  const driverContact =
    user && !isDriver && myJoin?.status === "confirmed"
      ? await getContact(supabase, ride.driver_id)
      : { phone: null, whatsapp: null };

  const price = ride.gas_contribution
    ? `$${Number(ride.gas_contribution).toFixed(0)}`
    : "Free";
  const pickupLocation = ride.pickup_location || ride.origin_label;
  const dropoffLocation = ride.dropoff_location || ride.destination_label;

  const cancelled = ride.status === "cancelled";
  const completed = ride.status === "completed";

  return (
    <div>
      {cancelled && (
        <div className="border-b border-red-200 bg-red-50">
          <div className="mx-auto flex max-w-4xl items-start gap-3 px-4 py-4 sm:px-6">
            <Ban size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-700">This ride was cancelled.</p>
              {ride.cancellation_reason && (
                <p className="mt-0.5 text-sm text-red-600">“{ride.cancellation_reason}”</p>
              )}
            </div>
          </div>
        </div>
      )}
      {completed && (
        <div className="border-b border-emerald-200 bg-emerald-50">
          <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
            <p className="text-sm font-bold text-emerald-700">This ride is closed.</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 pt-7 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/rides"
            aria-label="Back to rides"
            className="text-stone-500 transition hover:text-stone-800"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">Trip details</h1>
            <p className="text-sm text-stone-500">
              {ride.origin_label} &nbsp;→&nbsp; {ride.destination_label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-stone-900">{price}</span>
          <ShareButton title={`${ride.origin_label} → ${ride.destination_label}`} />
        </div>
      </div>

      {/* Dark band */}
      <div className="mt-5 bg-stone-900 text-white">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <p className="text-sm font-bold uppercase tracking-wide">
            {formatRideDateTime(ride.depart_at, "EEEE, MMM d hh:mm a").toUpperCase()}
          </p>
          <div className="mt-4 flex gap-5">
            <div className="flex flex-col items-center py-1">
              <span className="h-3 w-3 rounded-full border-2 border-white bg-transparent" />
              <span className="my-1 w-px flex-1 bg-white/30" />
              <span className="h-3 w-3 rounded-full bg-white" />
            </div>
            <div className="flex flex-1 flex-col gap-3.5 text-[15px]">
              <p>
                <span className="font-bold">Pick Up:</span>{" "}
                <span className="text-white/80">{pickupLocation}</span>
              </p>
              <p>
                <span className="font-bold">Drop off:</span>{" "}
                <span className="text-white/80">{dropoffLocation}</span>
              </p>
            </div>
          </div>
          {ride.round_trip && (
            <div className="mt-5 rounded-2xl bg-white/10 p-4 text-[15px]">
              <div className="flex items-center gap-2 font-bold">
                <ArrowLeftRight size={16} />
                Round trip included
              </div>
              {ride.return_depart_at && (
                <p className="mt-2 text-white/80">
                  Return leaves {formatRideDateTime(ride.return_depart_at, "EEEE, MMM d hh:mm a")}
                </p>
              )}
              {ride.return_notes && (
                <p className="mt-1 text-white/70">{ride.return_notes}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {ride.event && (
          <Link
            href={`/events/${ride.event.slug}`}
            className="mb-6 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
          >
            {ride.event.name}
          </Link>
        )}

        {/* Driver */}
        <p className="text-sm font-bold uppercase tracking-wide text-[#57534e]">Driver</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/profile/${ride.driver_id}`} className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <Avatar src={ride.driver?.avatar_url} name={ride.driver?.full_name} size={46} />
            <div>
              <div className="font-bold text-ink">
                {ride.driver?.full_name ?? "Driver"}
              </div>
              {(ride.driver?.pronouns || ride.driver?.car_make_model || ride.driver?.car_color) && (
                <div className="text-[13px] text-[#a8a29e]">
                  {[
                    ride.driver?.pronouns,
                    (ride.driver?.car_color || ride.driver?.car_make_model)
                      ? `drives a ${[ride.driver?.car_color, ride.driver?.car_make_model].filter(Boolean).join(" ")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </div>
          </Link>
          {user && !isDriver && myJoin?.status === "confirmed" && (
            <ContactModal
              driverName={ride.driver?.full_name?.split(" ")[0] ?? "Driver"}
              phone={driverContact.phone}
              whatsapp={driverContact.whatsapp}
              preferredContact={ride.driver?.preferred_contact ?? null}
              rideId={ride.id}
              driverId={ride.driver_id}
            />
          )}
        </div>

        {/* Note */}
        <p className="mt-8 text-sm font-bold uppercase tracking-wide text-[#57534e]">Note</p>
        <div className="mt-3 rounded-xl bg-[#f7f5f2] p-4 text-[15px] leading-relaxed text-[#44403c]">
          {ride.notes || "No additional notes."}
        </div>

        {/* Going */}
        <div className="mt-8 flex items-center justify-between">
          <p className="text-sm font-bold uppercase tracking-wide text-[#57534e]">Going</p>
          <p className="text-sm font-extrabold text-stone-500">
            {confirmedCount}/{ride.seats_total}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirmed.map((p) => (
            <Link
              key={p.id}
              href={`/profile/${p.passenger_id}`}
              aria-label={`View ${p.passenger?.full_name ?? "confirmed rider"}'s profile`}
              className="rounded-full transition hover:ring-2 hover:ring-brand-200 hover:ring-offset-1 active:scale-95"
            >
              <Avatar
                src={p.passenger?.avatar_url}
                name={p.passenger?.full_name}
                size={36}
              />
            </Link>
          ))}
          {Array.from({ length: Math.max(0, ride.seats_total - confirmed.length) }).map((_, i) => (
            <span
              key={i}
              className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#d6cfc4] text-[#c2bbb0]"
            >
              <Plus size={18} />
            </span>
          ))}
        </div>

        {/* Action */}
        <div className="mt-8">
          {!user ? (
            <GoogleSignInButton
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-4 text-base font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            />
          ) : isDriver ? (
            <DriverPanel ride={ride} passengerRows={passengerRows} />
          ) : cancelled ? (
            <div className="rounded-lg bg-red-50 px-6 py-4 text-center text-base font-bold text-red-500">
              This ride was cancelled
            </div>
          ) : myJoin ? (
            <div>
              <div className="rounded-lg bg-stone-100 px-6 py-4 text-center text-base font-bold text-stone-500">
                Seat {myJoin.status}
              </div>
              {ride.status === "active" &&
                (myJoin.status === "pending" || myJoin.status === "confirmed") && (
                <CancelSeatButton rideId={ride.id} />
              )}
            </div>
          ) : ride.seats_available > 0 ? (
            <ReserveSeatButton rideId={ride.id} />
          ) : (
            <div className="rounded-lg bg-stone-100 px-6 py-4 text-center text-base font-bold text-stone-400">
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
  const pendingRequests = passengerRows.filter((p) => p.status === "pending");
  const confirmedRiderCount = passengerRows.filter((p) => p.status === "confirmed").length;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="mb-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">
          Seat requests
        </h2>
      </div>
      {pendingRequests.length === 0 ? (
        <p className="text-sm text-stone-500">No requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {pendingRequests.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <Link
                href={`/profile/${p.passenger_id}`}
                className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
              >
                <Avatar src={p.passenger?.avatar_url} name={p.passenger?.full_name} size={32} />
                <div>
                  <p className="text-sm font-medium text-stone-900">
                    {p.passenger?.full_name ?? "Member"}
                  </p>
                  <p className="text-xs capitalize text-stone-400">{p.status}</p>
                </div>
              </Link>
              <PassengerStatusButtons passengerId={p.id} rideId={ride.id} />
            </li>
          ))}
        </ul>
      )}
      {ride.status === "active" && (
        <div className="mt-5 border-t border-stone-100 pt-4">
          <DriverRideActions rideId={ride.id} confirmedRiderCount={confirmedRiderCount} />
        </div>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { ArrowLeft, Plus, Ban, ArrowLeftRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatRideDateTime } from "@/lib/date-time";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { ShareButton } from "@/components/share-button";
import { ReportTargetButton } from "@/components/report-target-button";
import { GoogleSignInButton } from "@/components/auth-button";
import { ContactModal } from "@/components/contact-modal";
import { getContact } from "@/lib/contact";
import { getHomeAddress } from "@/lib/home-address";
import { getRideMeetup } from "@/lib/meetup";
import { confirmedSeatTotal, partyTotal, passengerDisplayName } from "@/lib/booking";
import { RIDE_WITH_JOIN } from "@/lib/rides-query";
import { canReserveRide } from "@/lib/action-lifecycle";
import {
  MeetupLocations,
  PassengerPickupNote,
  resolveMeetupLabels,
} from "@/components/meetup-locations";
import {
  ReserveSeatButton,
  CancelSeatButton,
  DriverRideActions,
  LostItemMessageButton,
} from "@/components/ride-actions";
import { PendingActionGroup } from "@/components/pending-action-button";
import type { Profile, Ride, RidePassenger } from "@/lib/types";
import { throwReadError } from "@/lib/supabase/read-error";
import { RiderDecisionDialog } from "@/components/rider-decision-dialog";
import {
  driverRouteEmbedUrl,
  riderEndpointLabel,
  type RiderEndpointLabel,
} from "@/lib/driver-route";

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

  const rideQuery = user
    ? supabase
        .from("rides")
        .select(RIDE_WITH_JOIN)
        .eq("id", id)
        .maybeSingle<
          Ride & { driver: Profile | null; event: { id: string; name: string; slug: string } | null }
        >()
    : supabase.rpc("public_ride_detail", { p_ride_id: id }).maybeSingle<
        Ride & { driver: Profile | null; event: { id: string; name: string; slug: string } | null }
      >();
  const passengersQuery = user
    ? supabase
        .from("ride_passengers")
        .select("*, passenger:profiles!ride_passengers_passenger_id_fkey(*)")
        .eq("ride_id", id)
    : Promise.resolve({ data: [] as PassengerRow[], error: null });
  const [{ data: ride, error: rideError }, { data: passengers, error: passengersError }] =
    await Promise.all([rideQuery, passengersQuery]);

  throwReadError(rideError, "ride");
  if (!ride) notFound();
  throwReadError(passengersError, "ride passengers");

  let passengerRows = (passengers as PassengerRow[]) ?? [];
  const missingProfileIds = passengerRows
    .filter((p) => !p.passenger && p.passenger_id)
    .map((p) => p.passenger_id);
  if (missingProfileIds.length) {
    const { data: fallbackProfiles, error: fallbackError } = await supabase
      .from("profiles")
      .select("*")
      .in("id", missingProfileIds);
    throwReadError(fallbackError, "passenger profiles");
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
    confirmedSeatTotal(passengerRows),
    ride.seats_total - ride.seats_available,
  );
  const meetupPromise = user ? getRideMeetup(supabase, id) : Promise.resolve([]);
  const homePromise = user ? getHomeAddress(supabase) : Promise.resolve(null);
  const [meetupRows, savedHome] = await Promise.all([meetupPromise, homePromise]);
  const meetup = resolveMeetupLabels({
    coarsePickup: ride.origin_label,
    coarseDropoff: ride.destination_label,
    meetupRows,
    userId: user?.id,
    isDriver,
  });
  const meetupByPassenger = new Map(
    meetupRows
      .filter((row) => row.passenger_id)
      .map((row) => [row.passenger_id as string, row]),
  );
  const endpointLabel = riderEndpointLabel(
    ride.origin_label,
    ride.destination_label,
  );

  // phone/whatsapp aren't on the profile join anymore (column-level RLS); read
  // the driver's numbers through the booking-scoped RPC, only when entitled.
  const driverContact =
    user && !isDriver && ride.status === "active" && myJoin?.status === "confirmed"
      ? await getContact(supabase, ride.driver_id)
      : { phone: null, whatsapp: null };

  const price = ride.gas_contribution
    ? `$${Number(ride.gas_contribution).toFixed(0)}`
    : "Free";

  const cancelled = ride.status === "cancelled";
  const completed = ride.status === "completed";
  const terminal = cancelled || completed;

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
          {user && user.id !== ride.driver_id && (
            <ReportTargetButton
              targetType="ride"
              targetId={ride.id}
              label="Report ride"
              variant="desktop"
              tone="subtle"
            />
          )}
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
            <MeetupLocations
              pickupLabel={meetup.pickupLabel}
              dropoffLabel={meetup.dropoffLabel}
              variant="desktop"
            />
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
          {user && !isDriver && ride.status === "active" && myJoin?.status === "confirmed" && (
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
          {Array.from({ length: Math.max(0, ride.seats_total - confirmedCount) }).map((_, i) => (
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
            <DriverPanel
              ride={ride}
              passengerRows={passengerRows}
              meetupByPassenger={meetupByPassenger}
              confirmedRiderCount={confirmedCount}
              driverHome={savedHome}
              endpointLabel={endpointLabel}
            />
          ) : terminal ? (
            <div className="rounded-lg bg-stone-100 px-6 py-4 text-center text-base font-bold text-stone-500">
              {cancelled ? "This ride was cancelled" : "This ride is closed"}
            </div>
          ) : myJoin?.status === "pending" || myJoin?.status === "confirmed" ? (
            <div>
              <div className="rounded-lg bg-stone-100 px-6 py-4 text-center text-base font-bold text-stone-500">
                Seat {myJoin.status}
                {partyTotal(myJoin.guest_count ?? 0) > 1
                  ? ` · Party of ${partyTotal(myJoin.guest_count ?? 0)}`
                  : ""}
              </div>
              {meetup.selfPickupNote && meetup.selfPickupMapsUrl && (
                <div className="mt-2 text-center">
                  <PassengerPickupNote
                    note={meetup.selfPickupNote}
                    mapsUrl={meetup.selfPickupMapsUrl}
                    endpointLabel={endpointLabel}
                  />
                </div>
              )}
              {myJoin.status === "confirmed" && !meetup.selfPickupNote && (
                <p className="mt-3 text-center text-sm text-stone-600">
                  Use in-app chat to confirm {endpointLabel?.toLowerCase() ?? "ride"} details with your driver.
                </p>
              )}
              {ride.status === "active" &&
                (myJoin.status === "pending" || myJoin.status === "confirmed") && (
                <CancelSeatButton rideId={ride.id} />
              )}
            </div>
          ) : canReserveRide(ride.status, myJoin?.status, ride.seats_available) ? (
            <ReserveSeatButton
              rideId={ride.id}
              seatsAvailable={ride.seats_available}
              savedHome={savedHome}
              endpointLabel={endpointLabel}
              label={myJoin ? "Request a seat again" : undefined}
            />
          ) : (
            <div className="rounded-lg bg-stone-100 px-6 py-4 text-center text-base font-bold text-stone-400">
              This ride is full
            </div>
          )}
        </div>
        {user && terminal && (
          <LostItemPanel
            rideId={ride.id}
            isDriver={isDriver}
            driverId={ride.driver_id}
            myJoinStatus={myJoin?.status}
            confirmed={confirmed}
          />
        )}
      </div>
    </div>
  );
}

function LostItemPanel({
  rideId,
  isDriver,
  driverId,
  myJoinStatus,
  confirmed,
}: {
  rideId: string;
  isDriver: boolean;
  driverId: string;
  myJoinStatus?: string;
  confirmed: PassengerRow[];
}) {
  if (!isDriver && myJoinStatus !== "confirmed") return null;

  if (!isDriver) {
    return (
      <div className="mt-4">
        <LostItemMessageButton rideId={rideId} otherUserId={driverId} />
      </div>
    );
  }

  if (!confirmed.length) return null;

  return (
    <div className="mt-4 space-y-2 rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-sm font-bold text-stone-900">Lost item follow-up</p>
      <PendingActionGroup>
        <div className="space-y-2">
          {confirmed.map((passenger) => (
            <LostItemMessageButton
              key={passenger.id}
              rideId={rideId}
              otherUserId={passenger.passenger_id}
              label={`Message ${passenger.passenger?.full_name ?? "confirmed passenger"}`}
            />
          ))}
        </div>
      </PendingActionGroup>
    </div>
  );
}

function DriverPanel({
  ride,
  passengerRows,
  meetupByPassenger,
  confirmedRiderCount,
  driverHome,
  endpointLabel,
}: {
  ride: Ride;
  passengerRows: PassengerRow[];
  meetupByPassenger: Map<string, { pickup_note: string | null }>;
  confirmedRiderCount: number;
  driverHome: string | null;
  endpointLabel: RiderEndpointLabel | null;
}) {
  const activeBookings = passengerRows.filter(
    (p) => p.status === "pending" || p.status === "confirmed",
  );

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="mb-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">
          Riders
        </h2>
      </div>
      {activeBookings.length === 0 ? (
        <p className="text-sm text-stone-500">No riders yet.</p>
      ) : (
        <ul className="space-y-3">
          {activeBookings.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <Link
                href={`/profile/${p.passenger_id}`}
                className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
              >
                <Avatar src={p.passenger?.avatar_url} name={p.passenger?.full_name} size={32} />
                <div>
                  <p className="text-sm font-medium text-stone-900">
                    {passengerDisplayName(p.passenger?.full_name, p.guest_count ?? 0)}
                  </p>
                  <p className="text-xs capitalize text-stone-400">{p.status}</p>
                  {meetupByPassenger.get(p.passenger_id)?.pickup_note && (
                    <p className="mt-0.5 text-xs text-stone-500">
                      {endpointLabel ?? "Location"}: {meetupByPassenger.get(p.passenger_id)?.pickup_note}
                    </p>
                  )}
                </div>
              </Link>
              {ride.status === "active" && p.status === "pending" && (
                <RiderDecisionDialog
                  variant="desktop"
                  passengerId={p.id}
                  rideId={ride.id}
                  riderId={p.passenger_id}
                  riderName={p.passenger?.full_name ?? "Member"}
                  riderAvatar={p.passenger?.avatar_url ?? null}
                  guestCount={p.guest_count ?? 0}
                  endpointLabel={endpointLabel}
                  endpointAddress={meetupByPassenger.get(p.passenger_id)?.pickup_note ?? null}
                  embedUrl={driverRouteEmbedUrl({
                    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY,
                    originLabel: ride.origin_label,
                    destinationLabel: ride.destination_label,
                    driverHome,
                    riderEndpoint: meetupByPassenger.get(p.passenger_id)?.pickup_note ?? null,
                  })}
                  missingHome={!driverHome}
                  mapsConfigured={Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY?.trim())}
                />
              )}
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

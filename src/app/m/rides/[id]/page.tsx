import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatRideDateTime } from "@/lib/date-time";
import { getCurrentUser } from "@/lib/auth";
import { SubHeader } from "@/components/mobile/sub-header";
import { MAvatar } from "@/components/mobile/m-avatar";
import { ContactSheet } from "@/components/mobile/contact-sheet";
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
import { MReserveButton } from "@/components/mobile/m-reserve";
import { ShareButton } from "@/components/share-button";
import { ReportTargetButton } from "@/components/report-target-button";
import { GoogleSignInButton } from "@/components/auth-button";
import {
  PassengerStatusButtons,
  CancelSeatButton,
  DriverRideActions,
  LostItemMessageButton,
} from "@/components/ride-actions";
import { PendingActionGroup } from "@/components/pending-action-button";
import type { Profile, Ride, RidePassenger } from "@/lib/types";
import { throwReadError } from "@/lib/supabase/read-error";

export const dynamic = "force-dynamic";

type PassengerRow = RidePassenger & { passenger: Profile | null };

export default async function MobileTripPage({
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

  const passengerRows = (passengers as PassengerRow[]) ?? [];
  const isDriver = user?.id === ride.driver_id;
  const myJoin = passengerRows.find((p) => p.passenger_id === user?.id);
  const confirmed = passengerRows.filter((p) => p.status === "confirmed");
  const activeBookings = passengerRows.filter(
    (p) => p.status === "pending" || p.status === "confirmed",
  );
  const confirmedCount = Math.max(
    confirmedSeatTotal(passengerRows),
    ride.seats_total - ride.seats_available,
  );
  const emptySlots = Math.max(0, ride.seats_total - confirmedCount);
  const meetupPromise = user ? getRideMeetup(supabase, id) : Promise.resolve([]);
  const homePromise =
    user && !isDriver ? getHomeAddress(supabase) : Promise.resolve(null);
  const [meetupRows, savedHome] = await Promise.all([meetupPromise, homePromise]);
  const meetup = resolveMeetupLabels({
    coarsePickup: ride.origin_label,
    coarseDropoff: ride.destination_label,
    meetupRows,
    userId: user?.id,
    isDriver,
  });
  const driverContact =
    user && !isDriver && ride.status === "active" && myJoin?.status === "confirmed"
      ? await getContact(supabase, ride.driver_id)
      : { phone: null, whatsapp: null };
  const meetupByPassenger = new Map(
    meetupRows
      .filter((row) => row.passenger_id)
      .map((row) => [row.passenger_id as string, row]),
  );

  const price = ride.gas_contribution ? `$${Number(ride.gas_contribution).toFixed(0)}` : "Free";
  const cancelled = ride.status === "cancelled";
  const completed = ride.status === "completed";
  const terminal = cancelled || completed;
  const driverFirst = ride.driver?.full_name?.split(" ")[0] ?? "the driver";
  const carLine = [
    ride.driver?.pronouns,
    [ride.driver?.car_color, ride.driver?.car_make_model].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="pb-28">
      <SubHeader
        title="Trip details"
        subtitle={`${ride.origin_label} → ${ride.destination_label}`}
        backFallback="/m"
        right={
          <>
            <span className="text-[19px] font-extrabold text-brand-600">{price}</span>
            {user && !isDriver && (
              <ReportTargetButton
                targetType="ride"
                targetId={ride.id}
                label="Report ride"
                variant="mobile"
                tone="subtle"
              />
            )}
            <span className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-tint text-brand-700 [&>button]:flex [&>button]:h-full [&>button]:w-full [&>button]:items-center [&>button]:justify-center">
              <ShareButton title={`${ride.origin_label} → ${ride.destination_label}`} />
            </span>
          </>
        }
      />

      <div className="space-y-5 px-4 pt-1">
        {cancelled && (
          <div className="rounded-[14px] bg-red-50 px-4 py-3 text-[13px] font-bold text-red-600">
            This ride was cancelled{ride.cancellation_reason ? ` — “${ride.cancellation_reason}”` : "."}
          </div>
        )}

        {/* Dark band — date + timeline */}
        <section className="rounded-[20px] bg-ink p-5 text-white">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gold-light">
            {formatRideDateTime(ride.depart_at, "EEEE, MMM d · h:mm a")}
          </p>
          <MeetupLocations
            pickupLabel={meetup.pickupLabel}
            dropoffLabel={meetup.dropoffLabel}
            pickupMapsUrl={meetup.pickupMapsUrl}
            dropoffMapsUrl={meetup.dropoffMapsUrl}
            variant="mobile"
          />
          {ride.round_trip && (
            <div className="mt-4 rounded-[16px] bg-white/10 p-3.5">
              <div className="flex items-center gap-2 text-[13px] font-extrabold">
                <ArrowLeftRight size={15} />
                Round trip included
              </div>
              {ride.return_depart_at && (
                <p className="mt-1.5 text-[13px] font-medium text-white/75">
                  Return leaves {formatRideDateTime(ride.return_depart_at, "EEE, MMM d · h:mm a")}
                </p>
              )}
              {ride.return_notes && (
                <p className="mt-1 text-[13px] text-white/65">{ride.return_notes}</p>
              )}
            </div>
          )}
        </section>

        {ride.event && (
          <Link
            href={`/m/events/${ride.event.slug}`}
            className="inline-block rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-700"
          >
            {ride.event.name}
          </Link>
        )}

        {/* Driver row */}
        <div className="flex items-center justify-between gap-3">
          <Link href={`/m/profile/${ride.driver_id}`} className="flex min-w-0 items-center gap-3 active:opacity-80">
            <MAvatar src={ride.driver?.avatar_url} name={ride.driver?.full_name} seed={ride.driver_id} size={48} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-ink">{ride.driver?.full_name ?? "Driver"}</p>
              {carLine && <p className="truncate text-xs text-muted-warm">{carLine}</p>}
            </div>
          </Link>
          {user && !isDriver && ride.status === "active" && myJoin?.status === "confirmed" && (
            <ContactSheet
              driverId={ride.driver_id}
              driverFullName={ride.driver?.full_name ?? null}
              rideId={ride.id}
              phone={driverContact.phone}
              whatsapp={driverContact.whatsapp}
              preferredContact={ride.driver?.preferred_contact ?? null}
            />
          )}
        </div>

        {/* Note from driver */}
        <div>
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600">
            Note from {driverFirst}
          </p>
          <div className="rounded-[14px] border border-border-soft bg-[#FBF6EE] p-3.5 text-[14px] leading-relaxed text-muted">
            {ride.notes || "No additional notes."}
          </div>
        </div>

        {/* Going */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600">Going</p>
            <p className="text-[12px] font-bold text-muted">
              {confirmedCount} of {ride.seats_total} seats
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {confirmed.map((p) => (
              <Link
                key={p.id}
                href={`/m/profile/${p.passenger_id}`}
                className="active:scale-95"
                aria-label={`View ${p.passenger?.full_name ?? "confirmed passenger"}'s profile`}
              >
                <MAvatar src={p.passenger?.avatar_url} name={p.passenger?.full_name} seed={p.passenger_id} size={46} />
              </Link>
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <span
                key={i}
                className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[#d6cfc4] text-[#c2bbb0]"
              >
                {i === 0 ? <Plus size={20} /> : null}
              </span>
            ))}
          </div>
        </div>

        {/* Driver seat-request management */}
        {isDriver && (
          <div className="rounded-[16px] border border-border bg-white p-4">
            <div className="mb-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted-warm">
                Riders
              </p>
            </div>
            {activeBookings.length === 0 ? (
              <p className="text-[13px] text-muted-warm">No riders yet.</p>
            ) : (
              <ul className="space-y-3">
                {activeBookings.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link href={`/m/profile/${p.passenger_id}`} className="flex min-w-0 items-center gap-2.5">
                        <MAvatar src={p.passenger?.avatar_url} name={p.passenger?.full_name} seed={p.passenger_id} size={34} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {passengerDisplayName(p.passenger?.full_name, p.guest_count ?? 0)}
                          </p>
                          <p className="text-[11px] capitalize text-muted-warm">{p.status}</p>
                          {meetupByPassenger.get(p.passenger_id)?.pickup_note && (
                            <p className="mt-0.5 truncate text-[11px] text-muted-warm">
                              Pickup: {meetupByPassenger.get(p.passenger_id)?.pickup_note}
                            </p>
                          )}
                        </div>
                      </Link>
                      {ride.status === "active" && p.status === "pending" && (
                        <PassengerStatusButtons passengerId={p.id} rideId={ride.id} />
                      )}
                    </li>
                  ))}
              </ul>
            )}
            {ride.status === "active" && (
              <div className="mt-4 border-t border-border-soft pt-4">
                <DriverRideActions
                  rideId={ride.id}
                  confirmedRiderCount={confirmedCount}
                  base="/m"
                />
              </div>
            )}
          </div>
        )}

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

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-border-soft bg-cream px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        {!user ? (
          <GoogleSignInButton
            next={`/m/rides/${ride.id}`}
            className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-brand-600 text-[15px] font-bold text-white"
          />
        ) : isDriver ? (
          <p className="py-2 text-center text-[13px] font-semibold text-muted-warm">
            You&apos;re the driver for this ride.
          </p>
        ) : terminal ? (
          <div className="flex h-[54px] items-center justify-center rounded-[14px] bg-tint text-[15px] font-bold text-muted">
            {cancelled ? "This ride was cancelled" : "This ride is closed"}
          </div>
        ) : myJoin?.status === "pending" || myJoin?.status === "confirmed" ? (
          <div>
            <div className="flex h-[48px] items-center justify-center rounded-[14px] bg-tint text-[14px] font-bold capitalize text-brand-700">
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
                  variant="mobile"
                />
              </div>
            )}
            {myJoin.status === "confirmed" && !meetup.selfPickupNote && (
              <p className="mt-2 text-center text-[12px] leading-relaxed text-muted-warm">
                Use in-app chat to confirm pickup details with {driverFirst}.
              </p>
            )}
            {ride.status === "active" &&
              (myJoin.status === "pending" || myJoin.status === "confirmed") && (
              <CancelSeatButton rideId={ride.id} base="/m" />
            )}
          </div>
        ) : canReserveRide(ride.status, myJoin?.status, ride.seats_available) ? (
          <MReserveButton
            rideId={ride.id}
            seatsAvailable={ride.seats_available}
            savedHome={savedHome}
            label={myJoin ? "Request a seat again" : undefined}
          />
        ) : (
          <div className="flex h-[54px] items-center justify-center rounded-[14px] bg-tint text-[15px] font-bold text-muted-warm">
            This ride is full
          </div>
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
      <div>
        <LostItemMessageButton rideId={rideId} otherUserId={driverId} base="/m/messages" />
      </div>
    );
  }

  if (!confirmed.length) return null;

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-white p-4">
      <p className="text-[13px] font-extrabold text-ink">Lost item follow-up</p>
      <PendingActionGroup>
        {confirmed.map((passenger) => (
          <LostItemMessageButton
            key={passenger.id}
            rideId={rideId}
            otherUserId={passenger.passenger_id}
            base="/m/messages"
            label={`Message ${passenger.passenger?.full_name ?? "confirmed passenger"}`}
          />
        ))}
      </PendingActionGroup>
    </section>
  );
}

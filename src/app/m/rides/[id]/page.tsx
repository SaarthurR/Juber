import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { SubHeader } from "@/components/mobile/sub-header";
import { MAvatar } from "@/components/mobile/m-avatar";
import { ContactSheet } from "@/components/mobile/contact-sheet";
import { TrunkControl } from "@/components/mobile/trunk-control";
import { MReserveButton } from "@/components/mobile/m-reserve";
import { ShareButton } from "@/components/share-button";
import { GoogleSignInButton } from "@/components/auth-button";
import {
  PassengerStatusButtons,
  CancelSeatButton,
  DriverRideOptions,
} from "@/components/ride-actions";
import type { Profile, Ride, RidePassenger } from "@/lib/types";

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
  const confirmedCount = Math.max(confirmed.length, ride.seats_total - ride.seats_available);
  const emptySlots = Math.max(0, ride.seats_total - confirmed.length);

  const price = ride.gas_contribution ? `$${Number(ride.gas_contribution).toFixed(0)}` : "Free";
  const cancelled = ride.status === "cancelled";
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
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-tint text-brand-700">
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
            {format(new Date(ride.depart_at), "EEEE, MMM d · h:mm a")}
          </p>
          <div className="mt-4 flex gap-4">
            <div className="flex flex-col items-center py-1">
              <span className="h-3 w-3 rounded-full border-2 border-white" />
              <span className="my-1 w-0.5 flex-1 bg-[#4B4540]" />
              <span className="h-3 w-3 rounded-full bg-white" />
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/45">
                  Pick up
                </p>
                <p className="text-[15px] font-bold">{ride.origin_label}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/45">
                  Drop off
                </p>
                <p className="text-[15px] font-bold">{ride.destination_label}</p>
              </div>
            </div>
          </div>
        </section>

        {ride.event && (
          <Link
            href={`/events/${ride.event.slug}`}
            className="inline-block rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-700"
          >
            {ride.event.name}
          </Link>
        )}

        {/* Driver row */}
        <div className="flex items-center justify-between gap-3">
          <Link href={`/profile/${ride.driver_id}`} className="flex min-w-0 items-center gap-3 active:opacity-80">
            <MAvatar src={ride.driver?.avatar_url} name={ride.driver?.full_name} seed={ride.driver_id} size={48} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-ink">{ride.driver?.full_name ?? "Driver"}</p>
              {carLine && <p className="truncate text-xs text-muted-warm">{carLine}</p>}
            </div>
          </Link>
          {user && !isDriver && (
            <ContactSheet
              driverId={ride.driver_id}
              driverFullName={ride.driver?.full_name ?? null}
              rideId={ride.id}
              phone={ride.driver?.phone ?? null}
              instagram={ride.driver?.instagram ?? null}
              preferredContact={ride.driver?.preferred_contact ?? null}
            />
          )}
        </div>

        {/* Trunk space */}
        <div>
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600">
            Trunk space
          </p>
          <TrunkControl />
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
              <Link key={p.id} href={`/profile/${p.passenger_id}`} className="active:scale-95">
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
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted-warm">
                Seat requests
              </p>
              {ride.status === "active" && <DriverRideOptions rideId={ride.id} />}
            </div>
            {passengerRows.filter((p) => p.status === "pending").length === 0 ? (
              <p className="text-[13px] text-muted-warm">No requests yet.</p>
            ) : (
              <ul className="space-y-3">
                {passengerRows
                  .filter((p) => p.status === "pending")
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link href={`/profile/${p.passenger_id}`} className="flex min-w-0 items-center gap-2.5">
                        <MAvatar src={p.passenger?.avatar_url} name={p.passenger?.full_name} seed={p.passenger_id} size={34} />
                        <span className="truncate text-[13px] font-semibold text-ink">
                          {p.passenger?.full_name ?? "Member"}
                        </span>
                      </Link>
                      <PassengerStatusButtons passengerId={p.id} rideId={ride.id} />
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-border-soft bg-cream px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        {!user ? (
          <GoogleSignInButton
            label="Sign in to reserve a seat"
            className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-brand-600 text-[15px] font-bold text-white"
          />
        ) : isDriver ? (
          <p className="py-2 text-center text-[13px] font-semibold text-muted-warm">
            You&apos;re the driver for this ride.
          </p>
        ) : cancelled ? (
          <div className="flex h-[54px] items-center justify-center rounded-[14px] bg-red-50 text-[15px] font-bold text-red-500">
            This ride was cancelled
          </div>
        ) : myJoin ? (
          <div>
            <div className="flex h-[48px] items-center justify-center rounded-[14px] bg-tint text-[14px] font-bold capitalize text-brand-700">
              Seat {myJoin.status}
            </div>
            {ride.status === "active" && myJoin.status !== "declined" && (
              <CancelSeatButton rideId={ride.id} />
            )}
          </div>
        ) : ride.seats_available > 0 ? (
          <MReserveButton rideId={ride.id} />
        ) : (
          <div className="flex h-[54px] items-center justify-center rounded-[14px] bg-tint text-[15px] font-bold text-muted-warm">
            This ride is full
          </div>
        )}
      </div>
    </div>
  );
}

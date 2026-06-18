import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeftRight } from "lucide-react";
import { MAvatar } from "@/components/mobile/m-avatar";
import { formatRideDateTime } from "@/lib/date-time";
import type { RideWithDriver, RideRequestWithRider } from "@/lib/types";

function priceLabel(value: number | null) {
  return value ? `$${Number(value).toFixed(0)}` : "Free";
}

// A compact pickup → JCNC route row with brand/gold dots and connector.
function RouteRow({ from, to }: { from: string; to: string }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-brand-600 bg-white" />
      <span className="max-w-[42%] truncate text-[13px] font-semibold text-ink">{from}</span>
      <span className="h-0.5 flex-1 rounded-full bg-gold" />
      <span className="max-w-[38%] truncate text-[13px] font-semibold text-ink">{to}</span>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" />
    </div>
  );
}

export function MRideCard({ ride }: { ride: RideWithDriver }) {
  const price = priceLabel(ride.gas_contribution);
  const full = ride.seats_available <= 0;
  const seatsLabel = full
    ? "Full"
    : `${ride.seats_available} seat${ride.seats_available > 1 ? "s" : ""} left`;

  return (
    <Link
      href={`/m/rides/${ride.id}`}
      className="block overflow-hidden rounded-2xl border border-border border-l-4 border-l-gold bg-white p-[15px] shadow-[0_14px_30px_-26px_rgba(28,25,23,0.4)] transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MAvatar
            src={ride.driver?.avatar_url}
            name={ride.driver?.full_name}
            seed={ride.driver_id}
            size={40}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">
              {ride.driver?.full_name ?? "Driver"}
            </p>
            {ride.driver?.neighborhood && (
              <p className="truncate text-xs text-muted-warm">{ride.driver.neighborhood}</p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-extrabold leading-none text-brand-600">{price}</p>
          <p className="mt-1 text-[11px] text-muted-warm">gas</p>
        </div>
      </div>

      <RouteRow from={ride.origin_label} to={ride.destination_label} />

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs font-bold text-muted">
          {formatRideDateTime(ride.depart_at, "EEE, MMM d · h:mm a")}
        </p>
        <span className="rounded-full bg-sand px-2.5 py-1 text-[11px] font-bold text-sand-text">
          {seatsLabel}
        </span>
      </div>
      {ride.round_trip && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-tint px-2.5 py-1 text-[11px] font-bold text-brand-700">
          <ArrowLeftRight size={12} strokeWidth={2.5} />
          {ride.return_depart_at
            ? `Round trip · ${formatRideDateTime(ride.return_depart_at, "h:mm a")}`
            : "Round trip"}
        </div>
      )}
    </Link>
  );
}

// Profile variant: upcoming rides show a green "Confirmed" chip; past rides are
// dimmed and show the gas price instead.
export function MProfileRideCard({
  ride,
  past = false,
}: {
  ride: RideWithDriver;
  past?: boolean;
}) {
  const price = priceLabel(ride.gas_contribution);
  return (
    <Link
      href={`/m/rides/${ride.id}`}
      className={`block overflow-hidden rounded-2xl border border-border border-l-4 border-l-gold p-[15px] transition active:scale-[0.99] ${
        past ? "bg-[#FBF6EE] opacity-[0.85]" : "bg-white shadow-[0_14px_30px_-26px_rgba(28,25,23,0.4)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MAvatar src={ride.driver?.avatar_url} name={ride.driver?.full_name} seed={ride.driver_id} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{ride.driver?.full_name ?? "Driver"}</p>
            {ride.driver?.neighborhood && (
              <p className="truncate text-xs text-muted-warm">{ride.driver.neighborhood}</p>
            )}
          </div>
        </div>
        {past ? (
          <p className="shrink-0 text-[17px] font-extrabold leading-none text-muted-warm">{price}</p>
        ) : (
          <span className="shrink-0 rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[11px] font-bold text-[#15803D]">
            Confirmed
          </span>
        )}
      </div>

      <RouteRow from={ride.origin_label} to={ride.destination_label} />

      <p className="mt-3 text-xs font-bold text-muted">
        {formatRideDateTime(ride.depart_at, "EEE, MMM d · h:mm a")}
      </p>
    </Link>
  );
}

export function MRequestCard({ request }: { request: RideRequestWithRider }) {
  const dateLabel =
    request.earliest_date && request.latest_date
      ? `${format(new Date(`${request.earliest_date}T12:00:00`), "MMM d")}–${format(
          new Date(`${request.latest_date}T12:00:00`),
          "MMM d",
        )}`
      : formatRideDateTime(request.depart_at, "EEE, MMM d");
  const priceLine =
    request.max_price != null ? `up to $${Number(request.max_price).toFixed(0)}` : "flexible gas";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white p-[15px] shadow-[0_14px_30px_-26px_rgba(28,25,23,0.4)]">
      <Link href={`/requests/${request.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <MAvatar
              src={request.rider?.avatar_url}
              name={request.rider?.full_name}
              seed={request.rider_id}
              size={40}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">
                {request.rider?.full_name ?? "Rider"}
              </p>
              <p className="truncate text-xs text-muted-warm">needs a ride</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-sand px-2.5 py-1 text-[11px] font-bold text-sand-text">
            {request.seats_needed} seat{request.seats_needed > 1 ? "s" : ""}
          </span>
        </div>

        <RouteRow from={request.origin_label} to={request.destination_label} />

        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-muted">
          <span>flexible {dateLabel}</span>
          <span className="text-muted-warm">·</span>
          <span className="text-brand-600">{priceLine}</span>
        </div>

        {request.notes && (
          <p className="mt-2.5 line-clamp-2 text-[13px] italic text-muted">
            &ldquo;{request.notes}&rdquo;
          </p>
        )}
      </Link>

      <Link
        href={`/requests/${request.id}`}
        className="mt-3.5 flex w-full items-center justify-center rounded-[13px] border-[1.5px] border-brand-600 px-4 py-3 text-[13px] font-bold text-brand-600 transition active:scale-[0.99]"
      >
        Offer a ride
      </Link>
    </div>
  );
}

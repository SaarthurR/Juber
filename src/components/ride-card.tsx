import Link from "next/link";
import { format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { RouteTrack } from "@/components/route-track";
import type { RideWithDriver, RideRequestWithRider } from "@/lib/types";

function SeatChip({ available }: { available: number }) {
  const label =
    available <= 0
      ? "Full"
      : `${available} seat${available > 1 ? "s" : ""} left`;
  return (
    <span className="shrink-0 rounded-full bg-sand px-3 py-1 text-xs font-bold text-sand-text">
      {label}
    </span>
  );
}

export function RideCard({ ride }: { ride: RideWithDriver }) {
  return (
    <Link
      href={`/rides/${ride.id}`}
      className="group block overflow-hidden rounded-2xl border border-[#efe4d3] border-l-4 border-l-gold bg-white px-5 py-4 shadow-[0_24px_50px_-32px_rgba(92,59,46,0.35)] transition hover:-translate-y-0.5 hover:border-l-brand-600 hover:shadow-[0_24px_50px_-24px_rgba(92,59,46,0.4)] active:translate-y-0"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Avatar src={ride.driver?.avatar_url} name={ride.driver?.full_name} size={32} />
          <span className="text-sm font-bold text-stone-900">
            {ride.driver?.full_name ?? "Driver"}
          </span>
        </div>
        {ride.event ? (
          <span className="text-xs font-semibold text-stone-500">
            {ride.event.name}
          </span>
        ) : (
          <span className="text-base font-extrabold text-brand-600">
            {ride.gas_contribution
              ? `$${Number(ride.gas_contribution).toFixed(0)}`
              : "Free"}
            <span className="ml-1 text-[11px] font-semibold text-stone-400">gas</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <RouteTrack from={ride.origin_label} to={ride.destination_label} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#f3ece1] pt-3">
        <span className="text-[12px] font-bold uppercase tracking-wide text-stone-500">
          {format(new Date(ride.depart_at), "EEE, MMM d · h:mm a")}
        </span>
        <SeatChip available={ride.seats_available} />
      </div>
    </Link>
  );
}

export function RequestCard({ request }: { request: RideRequestWithRider }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Avatar src={request.rider?.avatar_url} name={request.rider?.full_name} size={30} />
          <span className="text-sm font-semibold text-stone-900">
            {request.rider?.full_name ?? "Rider"}
          </span>
        </div>
        {request.event && (
          <span className="text-xs font-medium text-stone-500">
            {request.event.name}
          </span>
        )}
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-stone-500">
          {request.earliest_date && request.latest_date
            ? `${format(new Date(`${request.earliest_date}T12:00:00`), "MMM d")} – ${format(new Date(`${request.latest_date}T12:00:00`), "MMM d")}`
            : format(new Date(request.depart_at), "EEE, MMM d · h:mm a")}
        </span>
        <span className="text-sm font-bold text-stone-900">
          {request.seats_needed} seat{request.seats_needed > 1 ? "s" : ""}
        </span>
      </div>

      <RouteTrack from={request.origin_label} to={request.destination_label} />

      {request.max_price != null && (
        <p className="mt-2 text-xs text-stone-400">
          Up to ${Number(request.max_price).toFixed(0)}/seat
        </p>
      )}

      {request.rider?.phone && (
        <p className="mt-3.5 text-sm text-stone-600">
          Contact:{" "}
          <a href={`tel:${request.rider.phone}`} className="font-medium text-brand-600">
            {request.rider.phone}
          </a>
        </p>
      )}
    </div>
  );
}

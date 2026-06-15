import Link from "next/link";
import { format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { RouteTrack } from "@/components/route-track";
import { SeatBadges } from "@/components/seat-badges";
import type { RideWithDriver, RideRequestWithRider } from "@/lib/types";

export function RideCard({ ride }: { ride: RideWithDriver }) {
  return (
    <Link
      href={`/rides/${ride.id}`}
      className="group block rounded-xl border border-stone-200 bg-white px-5 py-4 transition hover:border-stone-300 hover:shadow-md active:scale-[0.99] active:shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Avatar src={ride.driver?.avatar_url} name={ride.driver?.full_name} size={30} />
          <span className="text-sm font-semibold text-stone-900">
            {ride.driver?.full_name ?? "Driver"}
          </span>
        </div>
        {ride.event && (
          <span className="text-xs font-medium text-stone-500">
            {ride.event.name}
          </span>
        )}
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-stone-500">
          {format(new Date(ride.depart_at), "EEE, MMM d · h:mm a")}
        </span>
        <span className="text-sm font-bold text-stone-900">
          {ride.gas_contribution
            ? `$${Number(ride.gas_contribution).toFixed(0)}`
            : "Free"}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <RouteTrack from={ride.origin_label} to={ride.destination_label} />
        </div>
        <SeatBadges total={ride.seats_total} available={ride.seats_available} />
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

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
      className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar src={ride.driver?.avatar_url} name={ride.driver?.full_name} />
          <span className="font-semibold">{ride.driver?.full_name ?? "Driver"}</span>
        </div>
        {ride.event && (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            {ride.event.name}
          </span>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-stone-700">
        <span>{format(new Date(ride.depart_at), "EEEE, MMM d hh:mm a")}</span>
        <span className="text-stone-900">
          {ride.gas_contribution
            ? `$${Number(ride.gas_contribution).toFixed(0)} gas`
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
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar src={request.rider?.avatar_url} name={request.rider?.full_name} />
          <span className="font-semibold">{request.rider?.full_name ?? "Rider"}</span>
        </div>
        {request.event && (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            {request.event.name}
          </span>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-stone-700">
        <span>
          {request.earliest_date && request.latest_date
            ? `${format(new Date(`${request.earliest_date}T12:00:00`), "MMM d")} – ${format(new Date(`${request.latest_date}T12:00:00`), "MMM d")}`
            : format(new Date(request.depart_at), "EEEE, MMM d hh:mm a")}
        </span>
        <span className="text-stone-900">
          {request.seats_needed} seat{request.seats_needed > 1 ? "s" : ""} needed
        </span>
      </div>

      <RouteTrack from={request.origin_label} to={request.destination_label} />

      {request.max_price != null && (
        <p className="mt-2 text-xs text-stone-500">
          Up to ${Number(request.max_price).toFixed(0)}/seat
        </p>
      )}

      {request.rider?.phone && (
        <p className="mt-4 text-sm text-stone-600">
          Contact:{" "}
          <a href={`tel:${request.rider.phone}`} className="text-brand-600">
            {request.rider.phone}
          </a>
        </p>
      )}
    </div>
  );
}

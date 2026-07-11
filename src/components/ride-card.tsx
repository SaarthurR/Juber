import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeftRight, CalendarDays, ChevronRight, CircleDollarSign, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatRideDateTime } from "@/lib/date-time";
import type { RideWithDriver, RideRequestWithRider } from "@/lib/types";

function priceLabel(value: number | null) {
  return value ? `$${Number(value).toFixed(0)}` : "Free";
}

function EventPill({ name }: { name: string }) {
  return (
    <span className="max-w-[150px] truncate rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
      {name}
    </span>
  );
}

function StatPill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-extrabold text-[#6f5b46]">
      {icon}
      {label}
    </span>
  );
}

function VisualRoute({
  from,
  to,
  accent = "offer",
}: {
  from: string;
  to: string;
  accent?: "offer" | "request";
}) {
  const filled = accent === "offer" ? "bg-brand-600" : "bg-[#4f5cf7]";
  const line = accent === "offer" ? "bg-gold" : "bg-[#dfe3ff]";

  return (
    <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(76px,0.75fr)_minmax(0,1fr)] items-center gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-sand-text">
          From
        </p>
        <p className="truncate text-2xl font-semibold tracking-[-0.03em] text-ink">
          {from}
        </p>
      </div>
      <div className="flex min-w-0 items-center">
        <span className={`h-4 w-4 shrink-0 rounded-full border-[3px] ${accent === "offer" ? "border-brand-600" : "border-[#4f5cf7]"} bg-white`} />
        <span className={`h-[3px] flex-1 ${line}`} />
        <span className={`h-4 w-4 shrink-0 rounded-full ${filled}`} />
      </div>
      <div className="min-w-0 text-right">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-sand-text">
          To
        </p>
        <p className="truncate text-2xl font-semibold tracking-[-0.03em] text-ink">
          {to}
        </p>
      </div>
    </div>
  );
}

export function RideCard({ ride }: { ride: RideWithDriver }) {
  const price = priceLabel(ride.gas_contribution);
  const full = ride.seats_available <= 0;

  return (
    <Link
      href={`/rides/${ride.id}`}
      data-motion="card"
      className="group block overflow-hidden rounded-[26px] border border-[#e7dac7] bg-white p-5 shadow-[0_28px_60px_-38px_rgba(92,59,46,0.45)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_30px_65px_-34px_rgba(92,59,46,0.45)] active:translate-y-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={ride.driver?.avatar_url} name={ride.driver?.full_name} size={48} />
          <div>
            <p className="truncate text-base font-extrabold text-ink">
              {ride.driver?.full_name ?? "Driver"}
            </p>
            {ride.driver?.neighborhood && (
              <p className="text-sm font-medium text-sand-text">{ride.driver.neighborhood}</p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {ride.event && <EventPill name={ride.event.name} />}
          <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink">
            {price}
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-sand-text">
            {price === "Free" ? "gas" : "gas / seat"}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <StatPill
          icon={<CalendarDays size={14} />}
          label={formatRideDateTime(ride.depart_at, "EEE, MMM d · h:mm a")}
        />
        <StatPill
          icon={<Users size={14} />}
          label={
            full
              ? "Full"
              : `${ride.seats_available} seat${ride.seats_available > 1 ? "s" : ""} left`
          }
        />
        {ride.round_trip && (
          <StatPill
            icon={<ArrowLeftRight size={14} />}
            label={
              ride.return_depart_at
                ? `Round trip · return ${formatRideDateTime(ride.return_depart_at, "h:mm a")}`
                : "Round trip"
            }
          />
        )}
      </div>

      <VisualRoute from={ride.origin_label} to={ride.destination_label} />

      <div className="mt-5 flex items-center justify-between border-t border-[#f3ece1] pt-4">
        <span className="text-sm font-bold text-sand-text">
          View ride details
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tint text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
          <ChevronRight size={18} />
        </span>
      </div>
    </Link>
  );
}

export function RequestCard({ request }: { request: RideRequestWithRider }) {
  const dateLabel =
    request.earliest_date && request.latest_date
      ? `${format(new Date(`${request.earliest_date}T12:00:00`), "MMM d")} - ${format(
          new Date(`${request.latest_date}T12:00:00`),
          "MMM d",
        )}`
      : formatRideDateTime(request.depart_at, "EEE, MMM d · h:mm a");

  return (
    <Link
      href={`/requests/${request.id}`}
      data-motion="card"
      className="group block overflow-hidden rounded-[26px] border border-[#e7dac7] bg-white p-5 shadow-[0_24px_55px_-38px_rgba(92,59,46,0.42)] transition hover:-translate-y-0.5 hover:border-[#cfd4ff] hover:shadow-[0_30px_65px_-36px_rgba(79,92,247,0.28)] active:translate-y-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={request.rider?.avatar_url} name={request.rider?.full_name} size={48} />
          <div>
            <p className="truncate text-base font-extrabold text-ink">
              {request.rider?.full_name ?? "Rider"}
            </p>
            <p className="text-sm font-medium text-sand-text">
              Needs a ride
              {request.rider?.neighborhood ? ` · ${request.rider.neighborhood}` : ""}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {request.event && <EventPill name={request.event.name} />}
          <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#4f5cf7]">
            {request.seats_needed}
            <span className="ml-1 text-sm font-extrabold text-sand-text">
              seat{request.seats_needed > 1 ? "s" : ""}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <StatPill icon={<CalendarDays size={14} />} label={dateLabel} />
        <StatPill
          icon={<CircleDollarSign size={14} />}
          label={
            request.max_price != null
              ? `Up to $${Number(request.max_price).toFixed(0)}/seat`
              : "Flexible price"
          }
        />
      </div>

      <VisualRoute from={request.origin_label} to={request.destination_label} accent="request" />

      <div className="mt-5 flex items-center justify-between border-t border-[#f3ece1] pt-4">
        <span className="text-sm font-bold text-[#4f5cf7]">
          View request details
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0ff] text-[#4f5cf7] transition group-hover:bg-[#4f5cf7] group-hover:text-white">
          <ChevronRight size={18} />
        </span>
      </div>
    </Link>
  );
}

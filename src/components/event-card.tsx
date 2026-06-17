import Link from "next/link";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import type { EventRow } from "@/lib/types";

function eventDates(event: EventRow) {
  if (!event.start_date) return null;
  const start = format(new Date(`${event.start_date}T12:00:00`), "MMM d");
  if (!event.end_date || event.end_date === event.start_date) return start;
  return `${start} – ${format(new Date(`${event.end_date}T12:00:00`), "MMM d")}`;
}

export function EventCard({
  event,
  rides,
  seats,
}: {
  event: EventRow;
  rides?: number;
  seats?: number;
}) {
  const dates = eventDates(event);
  return (
    <Link
      href={`/events/${event.slug}`}
      data-motion="card"
      className="group flex flex-col rounded-2xl border border-[#ebe7e0] bg-white p-[22px] transition hover:-translate-y-0.5 hover:border-[#e0d3bf] hover:shadow-[0_24px_50px_-32px_rgba(92,59,46,0.4)]"
    >
      <div className="mb-3.5 flex items-start justify-between">
        <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-tint text-brand-600">
          <CalendarDays size={22} />
        </span>
        {rides !== undefined && (
          <span className="rounded-full bg-[#f5f3f0] px-2.5 py-1 text-xs font-bold text-stone-500">
            {rides} {rides === 1 ? "ride" : "rides"}
          </span>
        )}
      </div>

      <h3 className="text-[18px] font-extrabold text-ink transition group-hover:text-brand-600">
        {event.name}
      </h3>
      <p className="mt-1 text-sm text-stone-500">
        {dates}
        {event.venue_label ? ` · ${event.venue_label}` : ""}
      </p>

      <div className="mt-auto flex items-center justify-between border-t border-[#f0ece5] pt-3.5 [margin-top:16px]">
        <span className="text-[13px] text-[#a8927a]">
          {seats !== undefined ? `${seats} seats open` : "View board"}
        </span>
        <span className="text-sm font-bold text-brand-600">View rides →</span>
      </div>
    </Link>
  );
}

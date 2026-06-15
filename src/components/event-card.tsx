import Link from "next/link";
import { format } from "date-fns";
import type { EventRow } from "@/lib/types";

function eventDates(event: EventRow) {
  if (!event.start_date) return null;
  const start = format(new Date(event.start_date), "MMM d");
  if (!event.end_date || event.end_date === event.start_date) return start;
  return `${start} – ${format(new Date(event.end_date), "MMM d")}`;
}

export function EventCard({ event }: { event: EventRow }) {
  const dates = eventDates(event);
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group block rounded-xl border border-stone-200 bg-white px-5 py-4 transition hover:border-stone-300 hover:shadow-md active:scale-[0.99] active:shadow-sm"
    >
      {dates && (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand-600">
          {dates}
        </p>
      )}
      <h3 className="font-semibold text-stone-900 group-hover:text-brand-600 transition">
        {event.name}
      </h3>
      {event.venue_label && (
        <p className="mt-1 text-sm text-stone-500">{event.venue_label}</p>
      )}
    </Link>
  );
}

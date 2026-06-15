import Link from "next/link";
import { format } from "date-fns";
import { CalendarHeart } from "lucide-react";
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
      className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <CalendarHeart size={20} />
      </div>
      <h3 className="font-semibold">{event.name}</h3>
      {dates && <p className="mt-1 text-sm text-stone-500">{dates}</p>}
      {event.venue_label && (
        <p className="mt-1 text-sm text-stone-500">{event.venue_label}</p>
      )}
    </Link>
  );
}

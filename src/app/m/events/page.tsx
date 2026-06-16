import Link from "next/link";
import { format } from "date-fns";
import { ChevronRight, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function eventDates(e: EventRow) {
  if (!e.start_date) return e.venue_label ?? "";
  const start = format(new Date(`${e.start_date}T12:00:00`), "MMM d");
  if (!e.end_date || e.end_date === e.start_date) return start;
  return `${start} – ${format(new Date(`${e.end_date}T12:00:00`), "MMM d")}`;
}

export default async function MobileEventsPage() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: events }, { data: rides }] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("start_date", { ascending: true }),
    supabase
      .from("rides")
      .select("event_id, seats_available")
      .eq("status", "active")
      .gte("depart_at", nowIso)
      .not("event_id", "is", null),
  ]);

  const list = (events as EventRow[]) ?? [];
  const seats = new Map<string, number>();
  for (const r of rides ?? []) {
    const id = r.event_id as string;
    seats.set(id, (seats.get(id) ?? 0) + (r.seats_available ?? 0));
  }

  return (
    <div className="pb-28">
      <header className="bg-white px-4 pb-4 pt-5">
        <h1 className="text-[23px] font-extrabold tracking-[-0.02em] text-ink">Events</h1>
        <p className="mt-0.5 text-[13px] text-muted-warm">
          Each gathering has its own carpool board.
        </p>
      </header>

      <div className="space-y-3 px-4 pt-4">
        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-[13px] text-muted-warm">
            No events yet. Check back soon!
          </p>
        ) : (
          list.map((e) => (
            <Link
              key={e.id}
              href={`/events/${e.slug}`}
              className="block overflow-hidden rounded-2xl border border-border bg-white p-[15px] shadow-[0_14px_30px_-26px_rgba(28,25,23,0.4)] transition active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-extrabold text-ink">{e.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-muted-warm">
                    <CalendarDays size={13} />
                    {eventDates(e)}
                    {e.venue_label ? ` · ${e.venue_label}` : ""}
                  </p>
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint text-brand-600">
                  <ChevronRight size={18} />
                </span>
              </div>
              <div className="mt-3 inline-flex rounded-full bg-sand px-2.5 py-1 text-[11px] font-bold text-sand-text">
                {seats.get(e.id) ?? 0} seat{(seats.get(e.id) ?? 0) === 1 ? "" : "s"} open
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

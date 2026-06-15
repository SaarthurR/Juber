import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/event-card";
import type { EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function eventDates(e: EventRow) {
  if (!e.start_date) return e.venue_label ?? "";
  const start = format(new Date(`${e.start_date}T12:00:00`), "MMM d");
  if (!e.end_date || e.end_date === e.start_date) return start;
  return `${start} – ${format(new Date(`${e.end_date}T12:00:00`), "MMM d")}`;
}

export default async function EventsPage() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: events }, { data: rides }, { data: requests }] =
    await Promise.all([
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
      supabase
        .from("ride_requests")
        .select("event_id")
        .eq("status", "active")
        .not("event_id", "is", null),
    ]);

  const list = (events as EventRow[]) ?? [];

  const stats = new Map<string, { rides: number; seats: number; requests: number }>();
  for (const e of list) stats.set(e.id, { rides: 0, seats: 0, requests: 0 });
  for (const r of rides ?? []) {
    const s = stats.get(r.event_id as string);
    if (s) {
      s.rides += 1;
      s.seats += r.seats_available ?? 0;
    }
  }
  for (const r of requests ?? []) {
    const s = stats.get(r.event_id as string);
    if (s) s.requests += 1;
  }

  const featured = list[0];
  const rest = list.slice(1);
  const fStat = featured ? stats.get(featured.id)! : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Events</h1>
      <p className="mt-1.5 text-[15px] text-stone-500">
        Each event has its own carpool board. Big gatherings fill up fast — post early.
      </p>

      {!featured ? (
        <p className="mt-8 rounded-2xl border border-dashed border-[#e0d3bf] p-10 text-center text-stone-500">
          No events yet. Check back soon!
        </p>
      ) : (
        <>
          {/* Featured */}
          <Link
            href={`/events/${featured.slug}`}
            className="group relative mt-7 block overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-500 px-8 py-8 text-white shadow-[0_24px_50px_-28px_rgba(92,59,46,0.55)] sm:px-9"
          >
            <span className="pointer-events-none absolute -right-8 -top-8 h-52 w-52 rounded-full bg-white/[0.08]" />
            <span className="pointer-events-none absolute bottom-[-50px] right-16 h-36 w-36 rounded-full bg-white/[0.06]" />
            <div className="relative">
              <span className="inline-block rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold tracking-wide">
                FEATURED · HIGH DEMAND
              </span>
              <h2 className="mt-3.5 text-3xl font-extrabold tracking-tight">{featured.name}</h2>
              <p className="mt-1.5 text-[15px] text-white/90">
                {eventDates(featured)}
                {featured.venue_label ? ` · ${featured.venue_label}` : ""}
                {featured.description ? ` · ${featured.description}` : ""}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-4">
                <Stat n={fStat!.rides} label="rides offered" />
                <span className="hidden h-9 w-px bg-white/25 sm:block" />
                <Stat n={fStat!.seats} label="seats still open" />
                <span className="hidden h-9 w-px bg-white/25 sm:block" />
                <Stat n={fStat!.requests} label="people requesting" />
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-700 transition group-hover:bg-[#fbf7f0]">
                  View rides <ArrowRight size={15} />
                </span>
              </div>
            </div>
          </Link>

          {/* Grid */}
          {rest.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  rides={stats.get(e.id)!.rides}
                  seats={stats.get(e.id)!.seats}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-extrabold">{n}</div>
      <div className="text-[13px] text-white/85">{label}</div>
    </div>
  );
}

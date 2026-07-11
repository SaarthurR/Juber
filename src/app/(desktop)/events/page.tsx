import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { EventCard } from "@/components/event-card";
import { EventRequestForm } from "@/components/event-request-form";
import {
  eventStatsAreEmpty,
  formatEventDateShort,
  loadEventSummaries,
} from "@/lib/events";
import type { EventRequest, EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const { user } = await getCurrentUser();
  const supabase = await createClient();

  const [summaries, requestRows] = await Promise.all([
    loadEventSummaries(supabase, Boolean(user)),
    user
      ? supabase
          .from("event_requests")
          .select("*, approved_event:events(id,name,slug)")
          .eq("requested_by", user.id)
          .order("created_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] }),
  ]);

  const featured = summaries[0];
  const rest = summaries.slice(1);
  const myRequests = (requestRows.data as (EventRequest & {
    approved_event: Pick<EventRow, "id" | "name" | "slug"> | null;
  })[]) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Events</h1>
      <p className="mt-1.5 text-[15px] text-stone-500">
        Each event has its own ride board. Big gatherings fill up fast — post early.
      </p>

      {!featured ? (
        <p className="mt-8 rounded-2xl border border-dashed border-[#e0d3bf] p-10 text-center text-stone-500">
          No events yet. Check back soon!
        </p>
      ) : (
        <>
          {/* Featured */}
          <Link
            href={`/events/${featured.event.slug}`}
            data-motion="card"
            data-auth-allowed="true"
            className="group relative mt-7 block overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-500 px-8 py-8 text-white shadow-[0_24px_50px_-28px_rgba(92,59,46,0.55)] sm:px-9"
          >
            <span className="pointer-events-none absolute -right-8 -top-8 h-52 w-52 rounded-full bg-white/[0.08]" />
            <span className="pointer-events-none absolute bottom-[-50px] right-16 h-36 w-36 rounded-full bg-white/[0.06]" />
            <div className="relative">
              <span className="inline-block rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold tracking-wide">
                FEATURED
              </span>
              <h2 className="mt-3.5 text-3xl font-extrabold tracking-tight">{featured.event.name}</h2>
              <p className="mt-1.5 line-clamp-2 text-[15px] text-white/90">
                {formatEventDateShort(featured.event)}
                {featured.event.venue_label ? ` · ${featured.event.venue_label}` : ""}
                {featured.event.description ? ` · ${featured.event.description}` : ""}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-4"> 
                {eventStatsAreEmpty(featured.stats) ? (
                  <p className="text-[15px] font-bold text-white">
                    Be the first to offer a ride for this ride board.
                  </p>
                ) : (
                  <>
                    <Stat n={featured.stats.rides} label="rides offered" />
                    <span className="hidden h-9 w-px bg-white/25 sm:block" />
                    <Stat n={featured.stats.seats} label="seats still open" />
                    {featured.stats.requests !== null && (
                      <>
                        <span className="hidden h-9 w-px bg-white/25 sm:block" />
                        <Stat n={featured.stats.requests} label="people requesting" />
                      </>
                    )}
                  </>
                )}
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-700 transition group-hover:bg-[#fbf7f0]">
                  View rides <ArrowRight size={15} />
                </span>
              </div>
            </div>
          </Link>

          {/* Grid */}
          {rest.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map(({ event, stats }) => (
                <EventCard
                  key={event.id}
                  event={event}
                  rides={stats.rides}
                  seats={stats.seats}
                  allowAnonymousBrowse
                />
              ))}
            </div>
          )}
        </>
      )}

      {myRequests.length > 0 && <EventRequestStatus rows={myRequests} />}
      <EventRequestForm signedIn={Boolean(user)} />
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

function EventRequestStatus({
  rows,
}: {
  rows: (EventRequest & { approved_event: Pick<EventRow, "id" | "name" | "slug"> | null })[];
}) {
  return (
    <section className="mt-8 rounded-2xl border border-[#e7ddcf] bg-white p-5">
      <h2 className="text-lg font-extrabold text-ink">Your event board requests</h2>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fbf7f0] px-4 py-3 text-sm">
            <span className="font-bold text-ink">{row.name}</span>
            {row.status === "approved" && row.approved_event ? (
              <Link className="font-bold text-brand-600 hover:underline" href={`/events/${row.approved_event.slug}`}>
                Approved — view ride board
              </Link>
            ) : (
              <span className="font-bold capitalize text-stone-500">{row.status}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

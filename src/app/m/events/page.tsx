import Link from "next/link";
import { ChevronRight, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { EventRequestForm } from "@/components/event-request-form";
import {
  formatEventDateShort,
  loadEventSummaries,
  loadMyEventRequests,
  type MyEventRequest,
} from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function MobileEventsPage() {
  const { user } = await getCurrentUser();
  const supabase = await createClient();

  const [summaries, myRequests] = await Promise.all([
    loadEventSummaries(supabase, Boolean(user)),
    user ? loadMyEventRequests(supabase, user.id, 4) : Promise.resolve([]),
  ]);

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+1rem)]">
      <header className="bg-white px-4 pb-4 pt-5">
        <h1 className="text-[23px] font-extrabold tracking-[-0.02em] text-ink">Events</h1>
        <p className="mt-0.5 text-[13px] text-muted-warm">
          Each gathering has its own ride board.
        </p>
      </header>

      <div className="space-y-3 px-4 pt-4">
        {summaries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-[13px] text-muted-warm">
            No events yet. Check back soon!
          </p>
        ) : (
          summaries.map(({ event, stats }) => (
            <Link
              key={event.id}
              href={`/m/events/${event.slug}`}
              data-auth-allowed="true"
              className="block overflow-hidden rounded-2xl border border-border bg-white p-[15px] shadow-[0_14px_30px_-26px_rgba(28,25,23,0.4)] transition active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-extrabold text-ink">{event.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-muted-warm">
                    <CalendarDays size={13} />
                    {formatEventDateShort(event)}
                    {event.venue_label ? ` · ${event.venue_label}` : ""}
                  </p>
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint text-brand-600">
                  <ChevronRight size={18} />
                </span>
              </div>
              <div className="mt-3 inline-flex rounded-full bg-sand px-2.5 py-1 text-[11px] font-bold text-sand-text">
                {stats.seats} seat{stats.seats === 1 ? "" : "s"} open
              </div>
            </Link>
          ))
        )}
      </div>
      {myRequests.length > 0 && <MobileEventRequestStatus rows={myRequests} />}
      <EventRequestForm signedIn={Boolean(user)} compact />
    </div>
  );
}

function MobileEventRequestStatus({ rows }: { rows: MyEventRequest[] }) {
  return (
    <section className="px-4 pt-4">
      <div className="rounded-2xl border border-border bg-white p-4">
        <h2 className="text-[15px] font-extrabold text-ink">My event requests</h2>
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl bg-sand px-3 py-2 text-[12px]">
              <p className="font-bold text-ink">{row.name}</p>
              {row.status === "approved" && row.approved_event ? (
                <Link
                  href={`/m/events/${row.approved_event.slug}`}
                  data-auth-allowed="true"
                  className="font-bold text-brand-600"
                >
                  Approved — view ride board
                </Link>
              ) : (
                <p className="font-bold capitalize text-muted-warm">{row.status}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

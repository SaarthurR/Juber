import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { formatEventDateRange, loadEventBoard } from "@/lib/events";
import { LandingAuthGate } from "@/components/landing-auth-gate";
import { EventSourceLink } from "@/components/event-source-link";
import { MRideCard, MRequestCard } from "@/components/mobile/mobile-cards";
import { SubHeader } from "@/components/mobile/sub-header";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { demoEventBoard } from "@/lib/demo-page-data";

export const dynamic = "force-dynamic";

export default async function MobileEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getCurrentUser();
  const demo = await getDemoRuntime();
  const board = demo
    ? demoEventBoard(demo.state, slug)
    : await loadEventBoard(await createClient(), slug, Boolean(user));
  if (!board) notFound();

  const { event, rides, requests } = board;
  const dateLabel = event.start_date
    ? formatEventDateRange(event.start_date, event.end_date)
    : null;

  const actionLinks = (
    <div className="grid grid-cols-2 gap-2">
      <Link
        href={`/m/rides/new?event_id=${event.id}`}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-[13px] font-bold text-white active:scale-[0.98]"
      >
        <Plus size={15} /> Post a ride
      </Link>
      <Link
        href={`/m/requests/new?event_id=${event.id}`}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-bold text-brand-600 active:scale-[0.98]"
      >
        <Plus size={15} /> Request a ride
      </Link>
    </div>
  );

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+1rem)]">
      <SubHeader title="Ride board" backFallback="/m/events" allowAnonymousBack />

      <div className="space-y-5 px-4 pt-2">
        <section className="rounded-3xl bg-brand-600 p-5 text-white shadow-[0_18px_44px_-34px_rgba(92,59,46,0.55)]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-100">
            Event ride board
          </p>
          <h1 className="mt-2 text-[24px] font-extrabold tracking-[-0.03em]">{event.name}</h1>
          {dateLabel && <p className="mt-1 text-[13px] font-semibold text-brand-50">{dateLabel}</p>}
          {event.venue_label && <p className="text-[13px] font-semibold text-brand-50">{event.venue_label}</p>}
          {event.description && <p className="mt-3 text-[13px] leading-relaxed text-white/90">{event.description}</p>}
          {event.source_url && (
            <div className="mt-3">
              <EventSourceLink
                href={event.source_url}
                className="text-[13px] font-bold text-white underline decoration-white/40 underline-offset-2"
              />
            </div>
          )}
        </section>

        {user ? actionLinks : <LandingAuthGate>{actionLinks}</LandingAuthGate>}

        <section>
          <h2 className="mb-3 text-[17px] font-extrabold text-ink">Ride board</h2>
          {rides.length ? (
            <div className="space-y-3">
              {rides.map((ride) => (
                <MRideCard key={ride.id} ride={ride} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-[13px] text-muted-warm">
              No rides for this event yet. Be the first to offer one.
            </p>
          )}
        </section>

        {requests.length > 0 && (
          <section>
            <h2 className="mb-3 text-[17px] font-extrabold text-ink">Ride requests</h2>
            <div className="space-y-3">
              {requests.map((request) => (
                <MRequestCard key={request.id} request={request} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

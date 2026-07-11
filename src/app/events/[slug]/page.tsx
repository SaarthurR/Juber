import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { formatEventDateRange, loadEventBoard } from "@/lib/events";
import { LandingAuthGate } from "@/components/landing-auth-gate";
import { RideCard, RequestCard } from "@/components/ride-card";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getCurrentUser();
  const supabase = await createClient();

  const board = await loadEventBoard(supabase, slug, Boolean(user));
  if (!board) notFound();

  const { event, rides: rideList, requests: requestList } = board;

  const dateLabel = event.start_date
    ? formatEventDateRange(event.start_date, event.end_date)
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl bg-brand-600 p-8 text-white">
        <h1 className="text-3xl font-bold">{event.name}</h1>
        {dateLabel && <p className="mt-1 text-brand-100">{dateLabel}</p>}
        {event.venue_label && <p className="text-brand-100">{event.venue_label}</p>}
        {event.description && <p className="mt-3 max-w-prose text-brand-50">{event.description}</p>}
      </div>

      {user ? <ActionLinks eventId={event.id} /> : <LandingAuthGate><ActionLinks eventId={event.id} /></LandingAuthGate>}

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold">Ride board</h2>
        {rideList.length ? (
          user ? (
            <RideGrid rides={rideList} />
          ) : (
            <LandingAuthGate>
              <RideGrid rides={rideList} />
            </LandingAuthGate>
          )
        ) : (
          <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
            No rides for this event yet. Be the first to offer one.
          </p>
        )}
      </section>

      {requestList.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-xl font-bold">Ride requests</h2>
          <div className="grid gap-4">
            {requestList.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ActionLinks({ eventId }: { eventId: string }) {
  return (
    <div className="mt-6 flex gap-3">
      <Link
        href={`/rides/new?event_id=${eventId}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus size={16} /> Post a ride
      </Link>
      <Link
        href={`/requests/new?event_id=${eventId}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
      >
        <Plus size={16} /> Request a ride
      </Link>
    </div>
  );
}

function RideGrid({ rides }: { rides: Parameters<typeof RideCard>[0]["ride"][] }) {
  return (
    <div className="grid gap-4">
      {rides.map((ride) => (
        <RideCard key={ride.id} ride={ride} />
      ))}
    </div>
  );
}

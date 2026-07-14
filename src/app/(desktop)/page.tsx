import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { TempleLogo } from "@/components/temple-logo";
import { RideCard } from "@/components/ride-card";
import { EventCard } from "@/components/event-card";
import { GoogleSignInButton } from "@/components/auth-button";
import { LandingAuthGate } from "@/components/landing-auth-gate";
import { loadEventSummaries, type EventSummary } from "@/lib/events";
import { RIDE_WITH_JOIN, asRideWithDriverRows } from "@/lib/rides-query";
import { throwReadError } from "@/lib/supabase/read-error";
import type { RideWithDriver } from "@/lib/types";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { demoActiveRides, demoEventSummaries } from "@/lib/demo-page-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user } = await getCurrentUser();
  const nowIso = new Date().toISOString();
  const demo = await getDemoRuntime();
  let rides: RideWithDriver[];
  let eventSummaries: EventSummary[];
  if (demo) {
    rides = demoActiveRides(demo.state, 3);
    eventSummaries = demoEventSummaries(demo.state);
  } else {
    const supabase = await createClient();
    const ridesPromise = user
      ? supabase
          .from("rides")
          .select(RIDE_WITH_JOIN)
          .eq("status", "active")
          .gte("depart_at", nowIso)
          .order("depart_at", { ascending: true })
          .limit(3)
      : supabase.rpc("public_upcoming_rides", {
          p_from: null,
          p_to: null,
          p_date: null,
          p_limit: 3,
          p_round_trip: null,
        });
    const [ridesResult, summaries] = await Promise.all([
      ridesPromise,
      loadEventSummaries(supabase, Boolean(user)),
    ]);
    throwReadError(ridesResult.error, "rides");
    rides = asRideWithDriverRows(ridesResult.data);
    eventSummaries = summaries;
  }

  const content = (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero band */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-600 px-7 py-12 text-white shadow-[0_18px_38px_-30px_rgba(92,59,46,0.45)] sm:px-12 sm:py-16">
        {/* faint temple silhouette */}
        <TempleLogo
          size={232}
          className="pointer-events-none absolute bottom-2 right-2 text-white/[0.07]"
        />
        <div className="relative">
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-[52px]">
            Find or offer a ride to JCNC
          </h1>
          <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-[#fbe8d2]">
            Coordinate carpools with JCNC community members for temple visits and events.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/rides"
              data-auth-allowed="true"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-brand-600 transition hover:bg-[#fbf7f0] active:scale-95"
            >
              Find a ride <ArrowRight size={15} />
            </Link>
            {!user ? (
              <GoogleSignInButton
                className="inline-flex items-center gap-2 rounded-xl border-[1.5px] border-white/70 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-95"
              />
            ) : (
              <Link
                href="/rides/new"
                className="inline-flex items-center gap-2 rounded-xl border-[1.5px] border-white/70 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-95"
              >
                Post a ride
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Upcoming events */}
      {eventSummaries.length > 0 && (
        <section className="mt-14">
          <SectionHeader title="Upcoming events" href="/events" allowAnonymousBrowse />
          <div className="grid gap-3 sm:grid-cols-3">
            {eventSummaries.slice(0, 3).map(({ event }) => (
              <EventCard key={event.id} event={event} allowAnonymousBrowse />
            ))}
          </div>
        </section>
      )}

      {/* Recent rides */}
      <section className="mt-14">
        <SectionHeader title="Scheduled rides" href="/rides" allowAnonymousBrowse />
        {rides.length > 0 ? (
          <div className="grid gap-3">
            {rides.map((ride) => (
              <RideCard key={ride.id} ride={ride} />
            ))}
          </div>
        ) : (
          <EmptyRides />
        )}
      </section>
    </div>
  );

  if (!user) return <LandingAuthGate>{content}</LandingAuthGate>;

  return content;
}

function SectionHeader({
  title,
  href,
  allowAnonymousBrowse = false,
}: {
  title: string;
  href: string;
  allowAnonymousBrowse?: boolean;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-xl font-bold text-stone-900">{title}</h2>
      <Link
        href={href}
        data-auth-allowed={allowAnonymousBrowse ? "true" : undefined}
        className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        View all <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function EmptyRides() {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 px-8 py-12 text-center">
      <p className="text-stone-500">No scheduled rides yet.</p>
      <Link
        href="/rides/new"
        className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
      >
        Be the first to offer a ride →
      </Link>
    </div>
  );
}

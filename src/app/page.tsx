import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { APP_TAGLINE } from "@/lib/constants";
import { RideCard } from "@/components/ride-card";
import { EventCard } from "@/components/event-card";
import { GoogleSignInButton } from "@/components/auth-button";
import type { EventRow, RideWithDriver } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user } = await getCurrentUser();
  const supabase = await createClient();

  const nowIso = new Date().toISOString();

  const { data: rides } = await supabase
    .from("rides")
    .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
    .eq("status", "active")
    .gte("depart_at", nowIso)
    .order("depart_at", { ascending: true })
    .limit(3);

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("is_active", true)
    .order("start_date", { ascending: true })
    .limit(3);

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pb-12 pt-14 sm:px-6 sm:pt-20">
        <h1 className="text-4xl font-extrabold tracking-tight text-stone-900 sm:text-5xl lg:text-[56px] lg:leading-[1.1]">
          Fewer cars.{" "}
          <span className="text-brand-600">Less harm.</span>
        </h1>
        <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-stone-600">
          {APP_TAGLINE} Share rides to JCNC with the sangha you already trust —
          especially during Paryushan and big events.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/rides"
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Find a ride <ArrowRight size={15} />
          </Link>
          {!user ? (
            <GoogleSignInButton label="Sign in to post a ride" />
          ) : (
            <Link
              href="/rides/new"
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-6 py-2.5 text-sm font-medium text-stone-800 transition hover:bg-stone-50"
            >
              Post a ride
            </Link>
          )}
        </div>

        <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 border-t border-stone-200 pt-8 text-sm text-stone-500">
          <span>· Rides to & from JCNC</span>
          <span>· Paryushan, Mahavir Jayanti &amp; more</span>
          <span>· Free to use, community-run</span>
        </div>
      </section>

      {/* Upcoming events */}
      {events && events.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
          <SectionHeader title="Upcoming events" href="/events" />
          <div className="grid gap-3 sm:grid-cols-3">
            {(events as EventRow[]).map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      {/* Recent rides */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <SectionHeader title="Latest rides" href="/rides" />
        {rides && rides.length > 0 ? (
          <div className="grid gap-3">
            {(rides as RideWithDriver[]).map((ride) => (
              <RideCard key={ride.id} ride={ride} />
            ))}
          </div>
        ) : (
          <EmptyRides />
        )}
      </section>
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-xl font-bold text-stone-900">{title}</h2>
      <Link
        href={href}
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
      <p className="text-stone-500">No rides posted yet.</p>
      <Link
        href="/rides/new"
        className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
      >
        Be the first to offer a ride →
      </Link>
    </div>
  );
}

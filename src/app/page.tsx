import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { TempleLogo } from "@/components/temple-logo";
import { RideCard } from "@/components/ride-card";
import { EventCard } from "@/components/event-card";
import { GoogleSignInButton } from "@/components/auth-button";
import { LandingAuthGate } from "@/components/landing-auth-gate";
import type { EventRow, RideWithDriver } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user } = await getCurrentUser();
  const supabase = await createClient();

  const nowIso = new Date().toISOString();

  const ridesPromise = user
    ? supabase
        .from("rides")
        .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
        .eq("status", "active")
        .gte("depart_at", nowIso)
        .order("depart_at", { ascending: true })
        .limit(3)
    : supabase.rpc("public_upcoming_rides", {
        p_from: null,
        p_to: null,
        p_date: null,
        p_limit: 3,
      });

  const [{ data: rides }, { data: events }] = await Promise.all([
    ridesPromise,
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("start_date", { ascending: true })
      .limit(3),
  ]);

  const content = (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero band */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-600 px-7 py-12 text-white shadow-[0_24px_50px_-28px_rgba(92,59,46,0.55)] sm:px-12 sm:py-16">
        {/* faint temple silhouette */}
        <TempleLogo
          size={280}
          className="pointer-events-none absolute -bottom-16 -right-10 text-white/[0.08]"
        />
        <div className="relative">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#e8c887]">
            Ahimsa on the road
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-[52px]">
            Fewer cars.{" "}
            <span className="text-[#e8c887]">Less harm.</span>
          </h1>
          <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-white/85">
            Share rides to JCNC with the sangha you already trust — especially
            during Paryushan and big events.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/rides"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-brand-600 transition hover:bg-[#fbf7f0] active:scale-95"
            >
              Find a ride <ArrowRight size={15} />
            </Link>
            {!user ? (
              <GoogleSignInButton
                label="Sign in to post a ride"
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
      {events && events.length > 0 && (
        <section className="mt-14">
          <SectionHeader title="Upcoming events" href="/events" />
          <div className="grid gap-3 sm:grid-cols-3">
            {(events as EventRow[]).map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      {/* Recent rides */}
      <section className="mt-14">
        <SectionHeader title="Scheduled rides" href="/rides" />
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

  if (!user) return <LandingAuthGate>{content}</LandingAuthGate>;

  return content;
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

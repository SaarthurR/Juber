import Link from "next/link";
import { ArrowRight, Leaf, Users, CalendarHeart } from "lucide-react";
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
      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700">
          <Leaf size={15} /> Carpool to JCNC
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-stone-900 sm:text-6xl">
          Fewer cars. <span className="text-brand-600">Less harm.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-stone-600">
          {APP_TAGLINE} Share rides to the temple — especially during Paryushan
          and other big events — and live ahimsa on the road.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/rides"
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 font-medium text-white transition hover:bg-brand-700"
          >
            Find a ride <ArrowRight size={18} />
          </Link>
          {!user && <GoogleSignInButton label="Sign in to post a ride" />}
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto grid max-w-5xl gap-4 px-4 sm:grid-cols-3 sm:px-6">
        <ValueProp
          icon={<Users className="text-brand-600" />}
          title="Carpool together"
          body="Post your seats or grab one. Coordinate with the JCNC sangha you already trust."
        />
        <ValueProp
          icon={<CalendarHeart className="text-brand-600" />}
          title="Built for events"
          body="Paryushan, Mahavir Jayanti, and more — each event has its own ride board."
        />
        <ValueProp
          icon={<Leaf className="text-brand-600" />}
          title="Live ahimsa"
          body="Every shared seat is one less car, less traffic, and less harm to the planet."
        />
      </section>

      {/* Upcoming events */}
      {events && events.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <SectionHeader title="Upcoming events" href="/events" />
          <div className="grid gap-4 sm:grid-cols-3">
            {(events as EventRow[]).map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      {/* Recent rides */}
      <section className="mx-auto max-w-5xl px-4 pb-20 pt-14 sm:px-6">
        <SectionHeader title="Latest rides" href="/rides" />
        {rides && rides.length > 0 ? (
          <div className="grid gap-4">
            {(rides as RideWithDriver[]).map((ride) => (
              <RideCard key={ride.id} ride={ride} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
            No rides posted yet. Be the first to{" "}
            <Link href="/rides/new" className="font-medium text-brand-600">
              offer a ride
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}

function ValueProp({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
        {icon}
      </div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <p className="text-sm text-stone-600">{body}</p>
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <h2 className="text-2xl font-bold">{title}</h2>
      <Link href={href} className="text-sm font-medium text-brand-600 hover:underline">
        View all
      </Link>
    </div>
  );
}

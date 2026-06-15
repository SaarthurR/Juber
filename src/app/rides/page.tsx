import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { RideCard, RequestCard } from "@/components/ride-card";
import { RideFilters } from "@/components/ride-filters";
import { TempleLogo } from "@/components/temple-logo";
import { GoogleSignInButton } from "@/components/auth-button";
import type { RideWithDriver, RideRequestWithRider } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = { [key: string]: string | string[] | undefined };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RidesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const showRequests = one(sp.tab) === "requests";
  const from = one(sp.from);
  const to = one(sp.to);
  const date = one(sp.date);

  const { user } = await getCurrentUser();
  const supabase = await createClient();

  let dayRange: { gte: string; lt: string } | null = null;
  if (date) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    dayRange = { gte: start.toISOString(), lt: end.toISOString() };
  }

  const nowIso = new Date().toISOString();

  function applyFilters<T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T; ilike: (c: string, v: string) => T }>(
    q: T,
  ): T {
    if (from) q = q.ilike("origin_label", `%${from}%`);
    if (to) q = q.ilike("destination_label", `%${to}%`);
    if (dayRange) q = q.gte("depart_at", dayRange.gte).lt("depart_at", dayRange.lt);
    else q = q.gte("depart_at", nowIso);
    return q;
  }

  const resultsQuery = showRequests
    ? applyFilters(
      supabase
        .from("ride_requests")
        .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
        .eq("status", "active")
        .order("depart_at", { ascending: true }),
    )
    : applyFilters(
      supabase
        .from("rides")
        .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
        .eq("status", "active")
        .order("depart_at", { ascending: true }),
    );

  const [{ data }, { count: requestCount }] = await Promise.all([
    resultsQuery,
    supabase
      .from("ride_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("depart_at", nowIso),
  ]);

  const rides = showRequests ? [] : ((data as RideWithDriver[]) ?? []);
  const requests = showRequests
    ? ((data as RideRequestWithRider[]) ?? [])
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Hero band */}
      <section className="relative mb-7 overflow-hidden rounded-3xl bg-brand-600 px-7 py-9 text-white shadow-[0_24px_50px_-30px_rgba(92,59,46,0.55)] sm:px-10 sm:py-10">
        <TempleLogo
          size={210}
          className="pointer-events-none absolute -bottom-12 -right-8 text-white/[0.08]"
        />
        <div className="relative">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#e8c887]">
            Ahimsa on the road
          </p>
          <h1 className="mt-2.5 max-w-xl text-[26px] font-extrabold leading-tight sm:text-3xl">
            Share a ride to the temple &amp; JCNC events.
          </h1>
          <p className="mt-2 max-w-md text-[15px] text-white/85">
            Find a carpool to{" "}
            <strong className="font-bold text-white">JCNC, Milpitas</strong> — message
            your driver to lock your seat.
          </p>
        </div>
      </section>

      {/* Segmented toggle + Post a ride */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex gap-1 rounded-xl bg-[#f1e6d6] p-1.5">
          <TabLink href="/rides" active={!showRequests} label="Carpools" />
          <TabLink
            href="/rides?tab=requests"
            active={showRequests}
            label="Ride requests"
            badge={requestCount ?? 0}
          />
        </div>
        {user ? (
          <Link
            href="/rides/new"
            className="shrink-0 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(92,59,46,0.6)] transition hover:bg-brand-700 active:scale-95"
          >
            Post a ride
          </Link>
        ) : (
          <GoogleSignInButton label="Sign in to post" />
        )}
      </div>

      <RideFilters />

      {/* Request a ride CTA */}
      {user && (
        <div className="mb-5 mt-3 flex justify-end">
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tint text-brand-600">
              <Plus size={12} strokeWidth={2.5} />
            </span>
            Request a ride
          </Link>
        </div>
      )}

      {/* Results */}
      <div className="mt-5 grid gap-4">
        {showRequests
          ? requests.length
            ? requests.map((r) => <RequestCard key={r.id} request={r} />)
            : <Empty kind="requests" />
          : rides.length
            ? rides.map((r) => <RideCard key={r.id} ride={r} />)
            : <Empty kind="rides" />}
      </div>
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
  badge,
}: {
  href: string;
  active: boolean;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-center gap-2 rounded-lg px-[18px] py-2 text-sm font-bold transition ${
        active
          ? "bg-brand-600 text-white"
          : "text-[#a8927a] hover:text-brand-700"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
            active ? "bg-white/25 text-white" : "bg-brand-600 text-white"
          }`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function Empty({ kind }: { kind: "rides" | "requests" }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e0d3bf] px-8 py-14 text-center">
      <p className="font-semibold text-stone-700">No {kind} match your search.</p>
      <p className="mt-1 text-sm text-stone-400">Try adjusting your filters or check back later.</p>
    </div>
  );
}

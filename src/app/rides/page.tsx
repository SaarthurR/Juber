import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { RideCard, RequestCard } from "@/components/ride-card";
import { RideFilters } from "@/components/ride-filters";
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

  let rides: RideWithDriver[] = [];
  let requests: RideRequestWithRider[] = [];

  if (showRequests) {
    const { data } = await applyFilters(
      supabase
        .from("ride_requests")
        .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
        .eq("status", "active")
        .order("depart_at", { ascending: true }),
    );
    requests = (data as RideRequestWithRider[]) ?? [];
  } else {
    const { data } = await applyFilters(
      supabase
        .from("rides")
        .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
        .eq("status", "active")
        .order("depart_at", { ascending: true }),
    );
    rides = (data as RideWithDriver[]) ?? [];
  }

  const { count: requestCount } = await supabase
    .from("ride_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gte("depart_at", nowIso);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            {showRequests ? "Ride Requests" : "Carpools"}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {showRequests
              ? "Riders looking for a lift — reach out if you can help."
              : "Let's find a ride for you. Message your driver to confirm your spot."}
          </p>
        </div>
        {user ? (
          <Link
            href="/rides/new"
            className="shrink-0 rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Post a ride
          </Link>
        ) : (
          <GoogleSignInButton label="Sign in to post" />
        )}
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-stone-100 p-1">
        <TabLink
          href="/rides"
          active={!showRequests}
          label="Carpools"
        />
        <TabLink
          href="/rides?tab=requests"
          active={showRequests}
          label="Ride Requests"
          badge={requestCount ?? 0}
        />
      </div>

      <RideFilters />

      {/* Request a ride CTA */}
      {user && !showRequests && (
        <div className="mb-5 mt-2 flex justify-end">
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-brand-600">
              <Plus size={12} strokeWidth={2.5} />
            </span>
            Request a ride
          </Link>
        </div>
      )}

      {/* Results */}
      <div className="grid gap-3">
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
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
        active
          ? "bg-white text-stone-900 shadow-sm"
          : "text-stone-500 hover:text-stone-700"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

function Empty({ kind }: { kind: "rides" | "requests" }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 px-8 py-14 text-center">
      <p className="font-medium text-stone-700">No {kind} match your search.</p>
      <p className="mt-1 text-sm text-stone-400">Try adjusting your filters or check back later.</p>
    </div>
  );
}

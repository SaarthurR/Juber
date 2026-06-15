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

  // Date filter -> [startOfDay, nextDay)
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

  // Live count for the "View Ride Requests" badge.
  const { count: requestCount } = await supabase
    .from("ride_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gte("depart_at", nowIso);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Tabs + post button */}
      <div className="mb-8 flex items-end justify-between border-b border-stone-200">
        <div className="-mb-px flex">
          <span className="border-b-2 border-brand-600 px-1 pb-3 text-base font-bold text-brand-600">
            Carpools
          </span>
        </div>
        {user ? (
          <Link
            href="/rides/new"
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Post a ride
          </Link>
        ) : (
          <span className="mb-3">
            <GoogleSignInButton label="Sign in to post" />
          </span>
        )}
      </div>

      <p className="mb-8 text-center text-sm text-stone-500">
        {showRequests
          ? "Riders looking for a lift — reach out if you can help."
          : "Let’s find a ride for you! (Remember to message your driver to confirm your spot)"}
      </p>

      <RideFilters />

      {/* Action row */}
      <div className="mb-8 mt-4 flex items-center justify-between">
        <Link
          href={showRequests ? "/rides" : "/rides?tab=requests"}
          className="inline-flex items-center gap-2 text-sm font-bold text-brand-600 hover:text-brand-700"
        >
          {showRequests ? "View Carpools" : "View Ride Requests"}
          {!showRequests && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
              {requestCount ?? 0}
            </span>
          )}
        </Link>

        {user ? (
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-600 hover:text-brand-700"
          >
            Request a Ride
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
              <Plus size={14} />
            </span>
          </Link>
        ) : (
          <GoogleSignInButton label="Sign in to request" />
        )}
      </div>

      {/* Results */}
      <div className="grid gap-4">
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

function Empty({ kind }: { kind: "rides" | "requests" }) {
  return (
    <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
      No {kind} match your search yet.
    </p>
  );
}

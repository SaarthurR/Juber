import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { TempleLogo } from "@/components/temple-logo";
import { RidesView } from "@/components/rides-view";
import type { RideRequestWithRider } from "@/lib/types";
import { dateOnlyToIso, getTodayDateInputValue, parseDateOnly } from "@/lib/date-time";
import { redirect } from "next/navigation";
import { RIDE_WITH_JOIN, asRideWithDriverRows } from "@/lib/rides-query";
import { throwReadError } from "@/lib/supabase/read-error";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { demoActiveRequests, demoActiveRides } from "@/lib/demo-page-data";
import type { RideWithDriver } from "@/lib/types";

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
  const now = new Date();
  const today = getTodayDateInputValue(now);
  const from = one(sp.from);
  const to = one(sp.to);
  const requestedDate = one(sp.date);
  const date =
    requestedDate === "all" ? "" : (parseDateOnly(requestedDate) ?? "");
  const trip = one(sp.trip);
  const tripFilter = trip === "round" || trip === "one" ? trip : null;
  const tab = one(sp.tab) === "requests" ? "requests" : null;
  if (
    (Array.isArray(sp.date) || (requestedDate && requestedDate !== "all")) &&
    !date
  ) {
    const clean = new URLSearchParams();
    if (from) clean.set("from", from);
    if (to) clean.set("to", to);
    if (tripFilter) clean.set("trip", tripFilter);
    if (tab) clean.set("tab", tab);
    redirect(`/rides${clean.size ? `?${clean}` : ""}`);
  }

  let dayRange: { gte: string; lt: string } | null = null;
  if (date) {
    const start = dateOnlyToIso(date, "00:00");
    const [year, month, day] = date.split("-").map(Number);
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
      .toISOString()
      .slice(0, 10);
    dayRange = { gte: start, lt: dateOnlyToIso(nextDate, "00:00") };
  }

  const nowIso = now.toISOString();
  const demo = await getDemoRuntime();
  let rides: RideWithDriver[];
  let requests: RideRequestWithRider[];
  let requestCount: number;
  let signedIn: boolean;

  function applyRequestFilters<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T; ilike: (c: string, v: string) => T }>(
    q: T,
  ): T {
    if (from) q = q.ilike("origin_label", `%${from}%`);
    if (to) q = q.ilike("destination_label", `%${to}%`);
    if (date) q = q.lte("earliest_date", date).gte("latest_date", date);
    else q = q.gte("latest_date", today);
    return q;
  }

  if (demo) {
    signedIn = true;
    rides = demoActiveRides(demo.state).filter((ride) =>
      (!from || ride.origin_label.toLowerCase().includes(from.toLowerCase()))
      && (!to || ride.destination_label.toLowerCase().includes(to.toLowerCase()))
      && (!tripFilter || ride.round_trip === (tripFilter === "round"))
      && (dayRange ? ride.depart_at >= dayRange.gte && ride.depart_at < dayRange.lt : ride.depart_at >= nowIso),
    ).sort((a, b) => a.depart_at.localeCompare(b.depart_at));
    requests = demoActiveRequests(demo.state).filter((request) =>
      (!from || request.origin_label.toLowerCase().includes(from.toLowerCase()))
      && (!to || request.destination_label.toLowerCase().includes(to.toLowerCase()))
      && (date
        ? Boolean(request.earliest_date && request.latest_date && request.earliest_date <= date && request.latest_date >= date)
        : Boolean(request.latest_date && request.latest_date >= today)),
    ).sort((a, b) => a.depart_at.localeCompare(b.depart_at));
    requestCount = requests.length;
  } else {
    const { user } = await getCurrentUser();
    const supabase = await createClient();
    signedIn = Boolean(user);
    const ridesQuery = user
      ? (() => {
        let q = supabase
          .from("rides")
          .select(RIDE_WITH_JOIN)
          .eq("status", "active")
          .order("depart_at", { ascending: true });
        if (from) q = q.ilike("origin_label", `%${from}%`);
        if (to) q = q.ilike("destination_label", `%${to}%`);
        if (tripFilter) q = q.eq("round_trip", tripFilter === "round");
        if (dayRange) q = q.gte("depart_at", dayRange.gte).lt("depart_at", dayRange.lt);
        else q = q.gte("depart_at", nowIso);
        return q;
        })()
      : supabase.rpc("public_upcoming_rides", {
        p_from: from ?? null,
        p_to: to ?? null,
        p_date: date || null,
        p_limit: 100,
        p_round_trip: tripFilter === null ? null : tripFilter === "round",
        });
    const requestsQuery = user
      ? applyRequestFilters(
        supabase
          .from("ride_requests")
          .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
          .eq("status", "active")
          .order("depart_at", { ascending: true }),
        )
      : Promise.resolve({ data: [], error: null });

    const [ridesResult, requestsResult, countResult] = await Promise.all([
      ridesQuery,
      requestsQuery,
      user
        ? supabase
          .from("ride_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .gte("latest_date", today)
        : Promise.resolve({ count: 0, error: null }),
    ]);
    throwReadError(ridesResult.error, "rides");
    throwReadError(requestsResult.error, "ride requests");
    throwReadError(countResult.error, "ride request count");
    rides = asRideWithDriverRows(ridesResult.data);
    requests = (requestsResult.data as RideRequestWithRider[]) ?? [];
    requestCount = countResult.count ?? 0;
  }

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

      <RidesView
        rides={rides}
        requests={requests}
        requestCount={requestCount ?? 0}
        signedIn={signedIn}
      />
    </div>
  );
}

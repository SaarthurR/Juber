import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { TempleLogo } from "@/components/temple-logo";
import { RidesView } from "@/components/rides-view";
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

  const ridesQuery = applyFilters(
    supabase
      .from("rides")
      .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
      .eq("status", "active")
      .order("depart_at", { ascending: true }),
  );
  const requestsQuery = applyFilters(
      supabase
        .from("ride_requests")
        .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
        .eq("status", "active")
        .order("depart_at", { ascending: true }),
  );

  const [
    { data: ridesData },
    { data: requestsData },
    { count: requestCount },
  ] = await Promise.all([
    ridesQuery,
    requestsQuery,
    supabase
      .from("ride_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("depart_at", nowIso),
  ]);

  const rides = (ridesData as RideWithDriver[]) ?? [];
  const requests = (requestsData as RideRequestWithRider[]) ?? [];

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
        signedIn={Boolean(user)}
      />
    </div>
  );
}

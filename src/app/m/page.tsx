import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { TempleLogo } from "@/components/temple-logo";
import { MAvatar } from "@/components/mobile/m-avatar";
import { HomeBoard } from "@/components/mobile/home-board";
import { MNotificationBell } from "@/components/mobile/notifications-sheet";
import { GoogleSignInButton } from "@/components/auth-button";
import type {
  NotificationWithContext,
  RideRequestWithRider,
  RideWithDriver,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MobileHomePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const from = one(sp.from) ?? "";
  const to = one(sp.to) ?? "";
  const date = one(sp.date) ?? "";
  const trip = one(sp.trip);
  const tripFilter = trip === "round" || trip === "one" ? trip : null;

  const { user, profile } = await getCurrentUser();
  const supabase = await createClient();

  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  let dayRange: { gte: string; lt: string } | null = null;
  if (date) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    dayRange = { gte: start.toISOString(), lt: end.toISOString() };
  }

  const ridesQuery = user
    ? (() => {
        let q = supabase
          .from("rides")
          .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
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
        p_from: from || null,
        p_to: to || null,
        p_date: date || null,
        p_limit: 100,
        p_round_trip: tripFilter === null ? null : tripFilter === "round",
      });

  let requestsQuery = supabase
    .from("ride_requests")
    .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
    .eq("status", "active")
    .order("depart_at", { ascending: true });
  if (from) requestsQuery = requestsQuery.ilike("origin_label", `%${from}%`);
  if (to) requestsQuery = requestsQuery.ilike("destination_label", `%${to}%`);
  if (date) requestsQuery = requestsQuery.lte("earliest_date", date).gte("latest_date", date);
  else requestsQuery = requestsQuery.gte("latest_date", today);

  const [{ data: ridesData }, { data: requestsData }, notif] = await Promise.all([
    ridesQuery,
    requestsQuery,
    user ? loadNotifications(supabase, user.id) : Promise.resolve({ items: [], unread: 0 }),
  ]);

  const rides = (ridesData as RideWithDriver[]) ?? [];
  const requests = (requestsData as RideRequestWithRider[]) ?? [];

  return (
    <div className="pb-28">
      {/* Top app bar */}
      <header className="flex items-center justify-between bg-white px-4 py-3">
        <Link href="/m" className="flex items-center gap-1.5">
          <TempleLogo size={26} className="text-brand-600" />
          <span className="text-[21px] font-extrabold tracking-[-0.03em] text-brand-600">
            {APP_NAME}
          </span>
        </Link>
        <div className="flex items-center gap-2.5">
          {user ? (
            <>
              <MNotificationBell notifications={notif.items} unreadCount={notif.unread} />
              <Link href="/m/profile" aria-label="Your profile" className="active:scale-95">
                <MAvatar src={profile?.avatar_url} name={profile?.full_name} seed={user.id} size={40} />
              </Link>
            </>
          ) : (
            <GoogleSignInButton
              className="rounded-full bg-brand-600 px-4 py-2 text-[13px] font-bold text-white"
            />
          )}
        </div>
      </header>

      <div className="space-y-4 px-4 pt-2">
        {/* Hero band */}
        <section className="relative overflow-hidden rounded-[22px] bg-brand-600 p-[22px] text-white">
          <TempleLogo
            size={150}
            className="pointer-events-none absolute -bottom-6 -right-4 text-white/[0.13]"
          />
          <div className="relative">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-gold-light">
              Ahimsa on the road
            </p>
            <h1 className="mt-2 text-[25px] font-extrabold leading-[1.12]">
              Share a ride to temple &amp; events
            </h1>
            <p className="mt-2 max-w-[260px] text-[13.5px] text-[#F3D9C0]">
              Carpools from your neighborhood to JCNC, Milpitas.
            </p>
          </div>
        </section>

        <HomeBoard
          rides={rides}
          requests={requests}
          initialFrom={from}
          initialTo={to}
          initialDate={date}
          initialTripFilter={tripFilter}
        />
      </div>
    </div>
  );
}

async function loadNotifications(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const [{ count }, result] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null),
    supabase
      .from("notifications")
      .select(
        "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), request:ride_requests!notifications_request_id_fkey(id,origin_label,destination_label,depart_at,status)",
      )
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  let data = result.data;
  if (result.error) {
    const fallback = await supabase
      .from("notifications")
      .select(
        "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status)",
      )
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(8);
    data = fallback.data;
  }

  const items = (((data as NotificationWithContext[] | null) ?? []).map((n) => ({
    ...n,
    request: n.request ?? null,
  })));
  return { items, unread: count ?? 0 };
}

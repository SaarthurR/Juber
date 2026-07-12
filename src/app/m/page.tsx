import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { TempleLogo } from "@/components/temple-logo";
import { MAvatar } from "@/components/mobile/m-avatar";
import { HomeBoard } from "@/components/mobile/home-board";
import { MNotificationBell } from "@/components/mobile/notifications-sheet";
import { GoogleSignInButton } from "@/components/auth-button";
import { getTodayDateInputValue, parseDateOnly } from "@/lib/date-time";
import { loadVisibleNotificationIds } from "@/lib/messages";
import { RIDE_WITH_JOIN, asRideWithDriverRows } from "@/lib/rides-query";
import { throwReadError } from "@/lib/supabase/read-error";
import type {
  NotificationWithContext,
  RideRequestWithRider,
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
  const now = new Date();
  const nowIso = now.toISOString();
  const today = getTodayDateInputValue(now);
  const from = one(sp.from) ?? "";
  const to = one(sp.to) ?? "";
  const requestedDate = one(sp.date);
  const date =
    requestedDate === "all" ? "" : (parseDateOnly(requestedDate) ?? "");
  const trip = one(sp.trip);
  const tripFilter = trip === "round" || trip === "one" ? trip : null;
  if (
    (Array.isArray(sp.date) || (requestedDate && requestedDate !== "all")) &&
    !date
  ) {
    const clean = new URLSearchParams();
    if (from) clean.set("from", from);
    if (to) clean.set("to", to);
    if (tripFilter) clean.set("trip", tripFilter);
    redirect(`/m${clean.size ? `?${clean}` : ""}`);
  }

  const { user, profile } = await getCurrentUser();
  const supabase = await createClient();

  const ridesQuery = user
    ? supabase
        .from("rides")
        .select(RIDE_WITH_JOIN)
        .eq("status", "active")
        .gte("depart_at", nowIso)
        .order("depart_at", { ascending: true })
    : supabase.rpc("public_upcoming_rides", {
        p_from: null,
        p_to: null,
        p_date: null,
        p_limit: 100,
        p_round_trip: null,
      });

  const requestsQuery = user
    ? supabase
        .from("ride_requests")
        .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
        .eq("status", "active")
        .gte("latest_date", today)
        .order("depart_at", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const [ridesResult, requestsResult, notif] = await Promise.all([
    ridesQuery,
    requestsQuery,
    user
      ? loadNotifications(supabase, user.id)
      : Promise.resolve({ items: [], unread: 0, error: null }),
  ]);
  throwReadError(ridesResult.error, "rides");
  throwReadError(requestsResult.error, "ride requests");

  const rides = asRideWithDriverRows(ridesResult.data);
  const requests = (requestsResult.data as RideRequestWithRider[]) ?? [];

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+1rem)]">
      {/* Top app bar */}
      <header className="flex items-center justify-between bg-white px-4 py-3">
        <Link href="/m" className="inline-flex min-h-11 items-center gap-1.5">
          <TempleLogo size={26} className="text-brand-600" />
          <span className="text-[21px] font-extrabold tracking-[-0.03em] text-brand-600">
            {APP_NAME}
          </span>
        </Link>
        <div className="flex items-center gap-2.5">
          {user ? (
            <>
              <Link
                href="/m/messages"
                prefetch
                aria-label="Your messages"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-tint text-brand-700 transition active:scale-95"
              >
                <MessageSquare size={18} strokeWidth={2.2} />
              </Link>
              <MNotificationBell
                notifications={notif.items}
                unreadCount={notif.unread}
                userId={user.id}
                initialError={notif.error}
              />
              <Link
                href="/m/profile"
                prefetch
                aria-label="Your profile"
                className="inline-flex h-11 w-11 items-center justify-center active:scale-95"
              >
                <MAvatar src={profile?.avatar_url} name={profile?.full_name} seed={user.id} size={40} />
              </Link>
            </>
          ) : (
            <GoogleSignInButton
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-brand-600 px-4 text-[13px] font-bold text-white"
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
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#fbe8d2]">
              Ahimsa on the road
            </p>
            <h1 className="mt-2 text-[25px] font-extrabold leading-[1.12]">
              Share a ride to temple &amp; events
            </h1>
            <p className="mt-2 max-w-[260px] text-[13.5px] text-[#fbe8d2]">
              Carpools from your neighborhood to JCNC, Milpitas.
            </p>
          </div>
        </section>

        <HomeBoard
          rides={rides}
          requests={requests}
          signedIn={Boolean(user)}
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
  const [unreadResult, notificationResult] = await Promise.all([
    loadVisibleNotificationIds(supabase, null, true),
    loadVisibleNotificationIds(supabase, 8, false),
  ]);
  if (unreadResult.error || notificationResult.error) {
    return {
      items: [],
      unread: 0,
      error: unreadResult.error ?? notificationResult.error,
    };
  }
  const unreadIds = unreadResult.ids;
  const notificationIds = notificationResult.ids;
  const result = notificationIds.length
    ? await supabase
        .from("notifications")
        .select(
          "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), request:ride_requests!notifications_request_id_fkey(id,origin_label,destination_label,depart_at,status)",
        )
        .eq("recipient_id", userId)
        .in("id", notificationIds)
        .order("created_at", { ascending: false })
    : { data: [] as NotificationWithContext[], error: null };

  let data = result.data;
  if (result.error) {
    const fallback = await supabase
      .from("notifications")
      .select(
        "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status)",
      )
      .eq("recipient_id", userId)
      .in("id", notificationIds)
      .order("created_at", { ascending: false })
      .limit(notificationIds.length);
    if (fallback.error) {
      return { items: [], unread: 0, error: "Could not load notifications." };
    }
    data = fallback.data;
  }

  const items = (((data as NotificationWithContext[] | null) ?? []).map((n) => ({
    ...n,
    request: n.request ?? null,
  })));
  return { items, unread: unreadIds.length, error: null };
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Phone, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { RideCard, RequestCard } from "@/components/ride-card";
import { openConversation } from "@/app/messages/actions";
import type { Profile, RideWithDriver, RideRequestWithRider } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All Rides" },
  { key: "posted", label: "Rides Posted" },
  { key: "joined", label: "Rides Joined" },
  { key: "requests", label: "Ride Requests" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const CONTACT_LABELS: Record<string, string> = {
  phone: "phone",
  instagram: "Instagram",
  message: "in-app message",
};

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const tab: TabKey = (TABS.find((t) => t.key === rawTab)?.key ?? "all") as TabKey;

  const { user } = await getCurrentUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single<Profile>();

  if (!profile) notFound();

  const isMe = user?.id === id;

  // --- Tab data queries ---
  let postedRides: RideWithDriver[] = [];
  let joinedRides: RideWithDriver[] = [];
  let rideRequests: RideRequestWithRider[] = [];

  if (tab === "all" || tab === "posted") {
    const { data } = await supabase
      .from("rides")
      .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
      .eq("driver_id", id)
      .order("depart_at", { ascending: false });
    postedRides = (data ?? []) as RideWithDriver[];
  }

  if (tab === "all" || tab === "joined") {
    const { data: joinedRows } = await supabase
      .from("ride_passengers")
      .select(
        "*, ride:rides!ride_passengers_ride_id_fkey(*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug))"
      )
      .eq("passenger_id", id)
      .eq("status", "confirmed");
    joinedRides = ((joinedRows ?? []).map((p: any) => p.ride).filter(Boolean)) as RideWithDriver[];
  }

  if (tab === "requests") {
    const { data } = await supabase
      .from("ride_requests")
      .select("*, rider:profiles!ride_requests_rider_id_fkey(*), event:events(id,name,slug)")
      .eq("rider_id", id)
      .order("created_at", { ascending: false });
    rideRequests = (data ?? []) as RideRequestWithRider[];
  }

  // Merge + deduplicate for "all" tab
  let allRides: RideWithDriver[] = [];
  if (tab === "all") {
    const seen = new Set<string>();
    const merged: RideWithDriver[] = [];
    for (const r of [...postedRides, ...joinedRides]) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        merged.push(r);
      }
    }
    merged.sort(
      (a, b) => new Date(b.depart_at).getTime() - new Date(a.depart_at).getTime()
    );
    allRides = merged;
  }

  // Contact method styling helpers
  const preferred = profile.preferred_contact ?? "message";

  function contactPillClass(method: string) {
    return method === preferred
      ? "inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
      : "inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition";
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Header card */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar src={profile.avatar_url} name={profile.full_name} size={72} />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {profile.full_name ?? "Member"}
              {profile.pronouns && (
                <span className="ml-2 text-base font-normal text-stone-400">
                  ({profile.pronouns})
                </span>
              )}
            </h1>
            {profile.neighborhood && (
              <p className="text-stone-500">{profile.neighborhood}</p>
            )}
          </div>
          {isMe && (
            <Link
              href="/profile"
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
            >
              Edit
            </Link>
          )}
        </div>

        {profile.bio && <p className="mt-4 text-stone-600">{profile.bio}</p>}

        {(profile.car_make_model || profile.car_color) && (
          <p className="mt-4 text-sm text-stone-500">
            Drives a {profile.car_color} {profile.car_make_model}
          </p>
        )}

        {user && !isMe && (
          <div className="mt-5">
            <p className="mb-3 text-sm text-stone-500">
              Prefers contact by{" "}
              <span className="font-medium">
                {CONTACT_LABELS[preferred] ?? preferred}
              </span>
            </p>
            <div className="flex flex-wrap gap-3">
              {profile.phone && (
                <a href={`tel:${profile.phone}`} className={contactPillClass("phone")}>
                  <Phone size={16} />
                  {profile.phone}
                </a>
              )}
              {profile.instagram && (
                <a
                  href={`https://instagram.com/${profile.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={contactPillClass("instagram")}
                >
                  <ExternalLink size={16} />
                  @{profile.instagram}
                </a>
              )}
              <form action={openConversation.bind(null, profile.id, undefined)}>
                <button className={contactPillClass("message")}>
                  <MessageCircle size={16} />
                  Message
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-8">
        <div className="flex gap-6 border-b border-stone-200">
          {TABS.map(({ key, label }) => (
            <Link
              key={key}
              href={`/profile/${id}?tab=${key}`}
              className={
                tab === key
                  ? "border-b-2 border-brand-600 pb-2 text-sm font-bold text-brand-600"
                  : "pb-2 text-sm text-stone-500 hover:text-stone-700"
              }
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="mt-6 grid gap-4">
          {tab === "all" &&
            (allRides.length > 0 ? (
              allRides.map((r) => <RideCard key={r.id} ride={r} />)
            ) : (
              <EmptyState />
            ))}

          {tab === "posted" &&
            (postedRides.length > 0 ? (
              postedRides.map((r) => <RideCard key={r.id} ride={r} />)
            ) : (
              <EmptyState />
            ))}

          {tab === "joined" &&
            (joinedRides.length > 0 ? (
              joinedRides.map((r) => <RideCard key={r.id} ride={r} />)
            ) : (
              <EmptyState />
            ))}

          {tab === "requests" &&
            (rideRequests.length > 0 ? (
              rideRequests.map((r) => <RequestCard key={r.id} request={r} />)
            ) : (
              <EmptyState />
            ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
      No rides yet.
    </p>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { Phone, AtSign, MessageCircle, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { initials } from "@/lib/utils";
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

function ContactRow({
  icon,
  tint,
  label,
  value,
  preferred,
  last,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
  preferred?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${last ? "" : "mb-4"}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-ink">
          {label}
          {preferred && <span className="font-semibold text-brand-600"> · preferred</span>}
        </div>
        <div className="truncate text-[13px] text-stone-500">{value}</div>
      </div>
    </div>
  );
}

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

  const nowIso = new Date().toISOString();

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
      .gte("depart_at", nowIso)
      .order("depart_at", { ascending: true });
    rideRequests = (data ?? []) as RideRequestWithRider[];
  }

  // Merge + deduplicate for "all" tab, then split live vs past
  let liveRides: RideWithDriver[] = [];
  let pastRides: RideWithDriver[] = [];
  if (tab === "all") {
    const seen = new Set<string>();
    const merged: RideWithDriver[] = [];
    for (const r of [...postedRides, ...joinedRides]) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        merged.push(r);
      }
    }
    const now = new Date(nowIso);
    liveRides = merged
      .filter((r) => new Date(r.depart_at) >= now)
      .sort((a, b) => new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime());
    pastRides = merged
      .filter((r) => new Date(r.depart_at) < now)
      .sort((a, b) => new Date(b.depart_at).getTime() - new Date(a.depart_at).getTime());
  }

  const preferred = profile.preferred_contact ?? "message";
  const igHandle = profile.instagram?.replace(/^@/, "");

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap gap-9 px-4 py-10 sm:px-6">
      {/* Left column */}
      <div className="w-full min-w-[260px] max-w-[320px] flex-1">
        <div className="mb-4 flex flex-col items-center text-center">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={profile.full_name ?? "Avatar"}
              className="mb-3.5 h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <div className="mb-3.5 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[34px] font-extrabold text-white">
              {initials(profile.full_name)}
            </div>
          )}
          <h1 className="text-2xl font-extrabold text-ink">{profile.full_name ?? "Member"}</h1>
          {profile.pronouns && <p className="text-sm text-[#a8a29e]">{profile.pronouns}</p>}
          {profile.neighborhood && (
            <p className="mt-1 text-sm text-stone-500">{profile.neighborhood}</p>
          )}
        </div>

        <div className="rounded-2xl bg-[#f7f5f2] p-[22px]">
          <p className="mb-4 text-[15px] font-extrabold text-ink">Contact</p>
          <ContactRow
            icon={<Phone size={15} className="text-[#15803d]" />}
            tint="bg-[#dcfce7]"
            label="Phone"
            value={profile.phone ?? "Not provided"}
            preferred={preferred === "phone"}
          />
          <ContactRow
            icon={<AtSign size={15} className="text-[#be185d]" />}
            tint="bg-[#fce7f3]"
            label="Instagram"
            value={igHandle ? `@${igHandle}` : "Not provided"}
            preferred={preferred === "instagram"}
          />
          <ContactRow
            icon={<MessageCircle size={15} className="text-brand-600" />}
            tint="bg-tint"
            label="In-app message"
            value="Reach out through Juber"
            preferred={preferred === "message"}
            last
          />
        </div>

        {isMe ? (
          <Link
            href="/profile"
            className="mt-3.5 flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#e2ddd5] px-4 py-2.5 text-sm font-bold text-[#44403c] transition hover:bg-stone-50"
          >
            <Pencil size={15} /> Edit profile
          </Link>
        ) : user ? (
          <form action={openConversation.bind(null, profile.id, undefined)} className="mt-3.5">
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700">
              <MessageCircle size={15} /> Message {profile.full_name?.split(" ")[0] ?? "member"}
            </button>
          </form>
        ) : null}
      </div>

      {/* Right column */}
      <div className="min-w-[300px] flex-[2]">
        <div className="mb-5 flex flex-wrap gap-6 border-b border-[#efece6]">
          {TABS.map(({ key, label }) => (
            <Link
              key={key}
              href={`/profile/${id}?tab=${key}`}
              className={
                tab === key
                  ? "-mb-px border-b-2 border-brand-600 pb-3 text-[15px] font-bold text-brand-600"
                  : "pb-3 text-[15px] font-semibold text-[#a8a29e] hover:text-stone-700"
              }
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="grid gap-4">
          {tab === "all" && (
            liveRides.length === 0 && pastRides.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {liveRides.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Live Rides</h3>
                    <div className="grid gap-3">
                      {liveRides.map((r) => <RideCard key={r.id} ride={r} />)}
                    </div>
                  </div>
                )}
                {pastRides.length > 0 && (
                  <div className={liveRides.length > 0 ? "mt-4" : ""}>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Past Rides</h3>
                    <div className="grid gap-3">
                      {pastRides.map((r) => <RideCard key={r.id} ride={r} />)}
                    </div>
                  </div>
                )}
              </>
            )
          )}

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

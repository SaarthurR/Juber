import Link from "next/link";
import { Phone, AtSign, MessageCircle, Pencil, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { MAvatar } from "@/components/mobile/m-avatar";
import { ProfileTabs } from "@/components/mobile/profile-tabs";
import { GoogleSignInButton } from "@/components/auth-button";
import type { RideWithDriver } from "@/lib/types";

export const dynamic = "force-dynamic";

type JoinedRideRow = { ride: RideWithDriver | null };

export default async function MobileProfilePage() {
  const { user, profile } = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-8 text-center">
        <MAvatar name={null} seed="guest" size={88} />
        <div>
          <h1 className="text-[21px] font-extrabold text-ink">Sign in to Juber</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            See your rides, manage your profile, and reserve seats.
          </p>
        </div>
        <GoogleSignInButton
          label="Sign in with Google"
          className="rounded-full bg-brand-600 px-6 py-3 text-[14px] font-bold text-white"
        />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: postedData }, { data: joinedData }] = await Promise.all([
    supabase
      .from("rides")
      .select("*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug)")
      .eq("driver_id", user.id)
      .order("depart_at", { ascending: false }),
    supabase
      .from("ride_passengers")
      .select(
        "ride:rides!ride_passengers_ride_id_fkey(*, driver:profiles!rides_driver_id_fkey(*), event:events(id,name,slug))",
      )
      .eq("passenger_id", user.id)
      .eq("status", "confirmed"),
  ]);

  const posted = (postedData as RideWithDriver[]) ?? [];
  const joined = ((joinedData as JoinedRideRow[] | null) ?? [])
    .map((r) => r.ride)
    .filter((r): r is RideWithDriver => Boolean(r));

  const preferred = profile?.preferred_contact ?? "message";
  const igHandle = profile?.instagram?.replace(/^@/, "");
  const metaLine = [profile?.pronouns, profile?.neighborhood].filter(Boolean).join(" · ");

  return (
    <div className="pb-28">
      {/* Identity header */}
      <header className="flex flex-col items-center bg-white px-4 pb-6 pt-8 text-center">
        <MAvatar src={profile?.avatar_url} name={profile?.full_name} seed={user.id} size={88} />
        <h1 className="mt-3 text-[23px] font-extrabold text-ink">
          {profile?.full_name ?? "Member"}
        </h1>
        {metaLine && <p className="mt-0.5 text-[13px] text-muted-warm">{metaLine}</p>}

        <div className="mt-4 flex items-center gap-2.5">
          <Link
            href="/m/profile/edit"
            className="flex items-center gap-2 rounded-[13px] border-[1.5px] border-brand-600 px-5 py-2.5 text-[13px] font-bold text-brand-600 transition active:scale-95"
          >
            <Pencil size={15} strokeWidth={2.2} />
            Edit profile
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-tint text-brand-700 transition active:scale-95"
            >
              <LogOut size={18} strokeWidth={2.2} />
            </button>
          </form>
        </div>
      </header>

      <div className="space-y-6 px-4 pt-5">
        {/* Contact card */}
        <div className="rounded-[18px] border border-border bg-white p-4">
          <ContactRow
            icon={<Phone size={16} className="text-brand-600" />}
            label="Phone"
            value={profile?.phone ?? "Not provided"}
            preferred={preferred === "phone"}
          />
          <ContactRow
            icon={<AtSign size={16} className="text-brand-600" />}
            label="Instagram"
            value={igHandle ? `@${igHandle}` : "Not provided"}
            preferred={preferred === "instagram"}
          />
          <ContactRow
            icon={<MessageCircle size={16} className="text-brand-600" />}
            label="In-app message"
            value="Reach out through Juber"
            preferred={preferred === "message"}
            last
          />
        </div>

        <ProfileTabs posted={posted} joined={joined} now={new Date().getTime()} />
      </div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  preferred,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  preferred?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${last ? "" : "mb-4"}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-tint">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink">
          {label}
          {preferred && (
            <span className="ml-2 rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold text-sand-text">
              preferred
            </span>
          )}
        </p>
        <p className="truncate text-[13px] text-muted">{value}</p>
      </div>
    </div>
  );
}

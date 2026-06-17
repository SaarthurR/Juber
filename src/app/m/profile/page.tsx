import Link from "next/link";
import { Phone, MessageCircle, Pencil, LogOut } from "lucide-react";
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
            icon={<WhatsAppIcon />}
            label="WhatsApp"
            value={profile?.whatsapp ?? "Not provided"}
            preferred={preferred === "whatsapp"}
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

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#8a5a2b"
        d="M12.04 2a9.84 9.84 0 0 0-8.5 14.78L2.4 22l5.35-1.1A9.84 9.84 0 1 0 12.04 2Z"
      />
      <path
        fill="white"
        d="M17.5 14.5c-.27.78-1.36 1.44-2.17 1.63-.58.12-1.34.22-3.9-.84-3.27-1.36-5.38-4.68-5.54-4.9-.16-.21-1.32-1.75-1.32-3.34s.83-2.37 1.13-2.7c.27-.3.72-.44 1.15-.44h.4c.35.01.53.04.76.58.27.65.93 2.25 1.01 2.42.08.16.13.36.03.57-.09.22-.14.35-.28.53-.14.16-.3.37-.43.5-.14.15-.29.3-.12.58.16.27.72 1.18 1.54 1.9 1.06.95 1.95 1.24 2.24 1.38.27.14.44.12.61-.07.2-.22.7-.82.89-1.1.18-.27.38-.23.64-.14.27.1 1.7.8 1.99.95.3.15.49.22.56.34.08.13.08.72-.19 1.5Z"
      />
    </svg>
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

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { TempleLogo } from "@/components/temple-logo";
import { GoogleSignInButton } from "@/components/auth-button";
import { NotificationBell } from "@/components/notification-bell";
import type { NotificationWithContext } from "@/lib/types";

export async function Navbar() {
  const { user, profile } = await getCurrentUser();

  let unread = 0;
  let notifications: NotificationWithContext[] = [];
  if (user) {
    const supabase = await createClient();
    const [{ count }, notificationsResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .is("read_at", null),
      supabase
        .from("notifications")
        .select(
          "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), request:ride_requests!notifications_request_id_fkey(id,origin_label,destination_label,depart_at,status)",
        )
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
    unread = count ?? 0;
    let data = notificationsResult.data;
    if (notificationsResult.error) {
      const fallback = await supabase
        .from("notifications")
        .select(
          "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status)",
        )
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6);
      data = fallback.data;
    }
    notifications = (((data as NotificationWithContext[] | null) ?? []).map((n) => ({
      ...n,
      request: n.request ?? null,
    })));
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#efe4d3] bg-white/95 backdrop-blur-sm">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-[19px] font-extrabold tracking-[-0.03em] text-brand-600 transition hover:text-brand-700"
        >
          <TempleLogo size={28} className="text-brand-600" />
          {APP_NAME}
        </Link>

        <div className="flex items-center gap-1 text-[15px] font-semibold text-[#57534e]">
          <NavLink href="/rides">Rides</NavLink>
          <NavLink href="/events">Events</NavLink>

          {user ? (
            <>
              <Link
                href="/messages"
                aria-label="Messages"
                className="ml-1 hidden h-[38px] w-[38px] items-center justify-center rounded-full text-[#57534e] transition hover:bg-[#f6e9da] hover:text-brand-700 sm:flex"
              >
                <MessageSquare size={19} strokeWidth={2} />
              </Link>
              <span className="ml-0.5">
                <NotificationBell
                  initial={notifications}
                  initialUnread={unread}
                  userId={user.id}
                />
              </span>
              {profile?.is_admin && <NavLink href="/admin">Admin</NavLink>}
              <Link
                href="/profile"
                className="ml-1.5 rounded-full transition hover:ring-2 hover:ring-brand-200 hover:ring-offset-1 active:scale-95"
              >
                <Avatar src={profile?.avatar_url} name={profile?.full_name} size={32} />
              </Link>
            </>
          ) : (
            <span className="ml-2">
              <GoogleSignInButton />
            </span>
          )}
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 transition hover:bg-[#f6e9da] hover:text-brand-700"
    >
      {children}
    </Link>
  );
}

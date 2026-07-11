import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { TempleLogo } from "@/components/temple-logo";
import { GoogleSignInButton } from "@/components/auth-button";
import { NotificationBell } from "@/components/notification-bell";
import { MessagesNavLink } from "@/components/messages-nav-link";
import { ActiveNavLink, ActiveProfileLink } from "@/components/active-nav-link";
import { loadVisibleNotificationIds } from "@/lib/messages";
import type { NotificationWithContext } from "@/lib/types";

export async function Navbar() {
  const { user, profile } = await getCurrentUser();

  let unread = 0;
  let notificationUnread = 0;
  let notifications: NotificationWithContext[] = [];
  if (user) {
    const supabase = await createClient();
    const [unreadIds, notificationIds] = await Promise.all([
      loadVisibleNotificationIds(supabase, null, true),
      loadVisibleNotificationIds(supabase, 6, false),
    ]);
    const notificationsResult = notificationIds.length
      ? await supabase
          .from("notifications")
          .select(
            "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), request:ride_requests!notifications_request_id_fkey(id,origin_label,destination_label,depart_at,status)",
          )
          .eq("recipient_id", user.id)
          .in("id", notificationIds)
          .order("created_at", { ascending: false })
      : { data: [] as NotificationWithContext[], error: null };
    notificationUnread = unreadIds.length;
    unread = notificationUnread;
    let data = notificationsResult.data;
    if (notificationsResult.error) {
      const fallback = await supabase
        .from("notifications")
        .select(
          "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status)",
        )
        .eq("recipient_id", user.id)
        .in("id", notificationIds)
        .order("created_at", { ascending: false })
        .limit(notificationIds.length);
      if (fallback.error) throw new Error("Could not load notifications.");
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
          <ActiveNavLink href="/rides">Rides</ActiveNavLink>
          <ActiveNavLink href="/events">Events</ActiveNavLink>

          {user ? (
            <>
              <MessagesNavLink userId={user.id} initialUnread={unread} />
              <span className="ml-0.5">
                <NotificationBell
                  initial={notifications}
                  initialUnread={notificationUnread}
                  userId={user.id}
                />
              </span>
              {profile?.is_admin && <ActiveNavLink href="/admin">Admin</ActiveNavLink>}
              <ActiveProfileLink>
                <Avatar src={profile?.avatar_url} name={profile?.full_name} size={32} />
              </ActiveProfileLink>
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

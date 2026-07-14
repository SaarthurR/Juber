import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { NotificationCard } from "@/components/notification-card";
import { NotificationsMarkRead } from "@/components/notifications-mark-read";
import { MessagesList } from "@/components/messages-list";
import { FALLBACK_NOTIFICATION_SELECT, NOTIFICATION_SELECT } from "@/lib/notifications-query";
import type { NotificationWithContext } from "@/lib/types";
import { loadThreadSummaries, loadVisibleNotificationIds } from "@/lib/messages";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { queryDemoNotifications, queryDemoThreadSummaries } from "@/lib/demo/queries";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const showNotifications = tab === "notifications";

  const { user } = await getCurrentUser();
  if (!user) redirect("/");
  const demo = await getDemoRuntime();
  const unreadResult = demo
    ? {
        ids: queryDemoNotifications(demo.state, user.id)
          .filter((notification) => !notification.read_at)
          .map((notification) => notification.id),
        error: null,
      }
    : await loadVisibleNotificationIds(await createClient(), null, true);
  const unreadCount = unreadResult.error ? 0 : unreadResult.ids.length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-5 text-2xl font-bold">Inbox</h1>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-stone-100 p-1">
        <TabLink href="/messages" active={!showNotifications} label="Messages" />
        <TabLink
          href="/messages?tab=notifications"
          active={showNotifications}
          label="Notifications"
          badge={unreadCount ?? 0}
        />
      </div>
      {unreadResult.error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          Notifications are temporarily unavailable.
        </p>
      )}

      {showNotifications ? (
        <NotificationsTab userId={user.id} hasUnread={(unreadCount ?? 0) > 0} />
      ) : (
        <MessagesTab userId={user.id} />
      )}
    </div>
  );
}

async function MessagesTab({ userId }: { userId: string }) {
  const demo = await getDemoRuntime();
  if (demo) {
    return <MessagesList userId={userId} initialThreads={queryDemoThreadSummaries(demo.state, userId)} />;
  }
  const supabase = await createClient();
  const threads = await loadThreadSummaries(supabase, userId);

  return <MessagesList userId={userId} initialThreads={threads} />;
}

async function NotificationsTab({
  userId,
  hasUnread,
}: {
  userId: string;
  hasUnread: boolean;
}) {
  const demo = await getDemoRuntime();
  if (demo) {
    const notifications = queryDemoNotifications(demo.state, userId).slice(0, 50);
    return (
      <>
        <NotificationsMarkRead hasUnread={hasUnread} />
        {notifications.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
            No notifications yet. You&apos;ll hear here when there&apos;s activity on your rides.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {notifications.map((notification) => (
              <li key={notification.id}><NotificationCard n={notification} /></li>
            ))}
          </ul>
        )}
      </>
    );
  }
  const supabase = await createClient();
  const visibility = await loadVisibleNotificationIds(supabase, 50, false);
  const notificationIds = visibility.ids;
  if (visibility.error) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">
        Notifications are temporarily unavailable.
      </p>
    );
  }

  const notificationsResult = notificationIds.length
    ? await supabase
        .from("notifications")
        .select(NOTIFICATION_SELECT)
        .eq("recipient_id", userId)
        .in("id", notificationIds)
        .order("created_at", { ascending: false })
    : { data: [] as NotificationWithContext[], error: null };

  let data = notificationsResult.data;
  if (notificationsResult.error) {
    const fallback = await supabase
      .from("notifications")
      .select(FALLBACK_NOTIFICATION_SELECT)
      .eq("recipient_id", userId)
      .in("id", notificationIds)
      .order("created_at", { ascending: false })
      .limit(notificationIds.length);
    if (fallback.error) {
      return (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">
          Notifications are temporarily unavailable.
        </p>
      );
    }
    data = fallback.data;
  }

  const notifications = (((data as NotificationWithContext[] | null) ?? []).map((n) => ({
    ...n,
    request: n.request ?? null,
  })));

  if (notifications.length === 0) {
    return (
      <>
        <NotificationsMarkRead hasUnread={hasUnread} />
        <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
          No notifications yet. You&apos;ll hear here when there&apos;s activity on your rides.
        </p>
      </>
    );
  }

  return (
    <>
      <NotificationsMarkRead hasUnread={hasUnread} />
      <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {notifications.map((n) => (
          <li key={n.id}>
            <NotificationCard n={n} />
          </li>
        ))}
      </ul>
    </>
  );
}

function TabLink({
  href,
  active,
  label,
  badge,
}: {
  href: string;
  active: boolean;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      prefetch
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium ${
        active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

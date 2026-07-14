import "server-only";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { queryDemoNotifications } from "@/lib/demo/queries";
import { createClient } from "@/lib/supabase/server";
import { loadVisibleNotificationIds } from "@/lib/messages";
import {
  FALLBACK_NOTIFICATION_SELECT,
  NOTIFICATION_SELECT,
} from "@/lib/notifications-query";
import type { NotificationSnapshot } from "@/lib/notifications-controller";
import type { NotificationWithContext } from "@/lib/types";

export async function loadDesktopNotificationSnapshot(
  userId: string,
): Promise<NotificationSnapshot> {
  const runtime = await getDemoRuntime();
  if (runtime) {
    const items = queryDemoNotifications(runtime.state, userId).slice(0, 6);
    const unreadIds = Object.values(runtime.state.notifications)
      .filter((notification) => notification.recipient_id === userId && !notification.read_at)
      .map((notification) => notification.id);
    return { items, unread: unreadIds.length, unreadIds, error: null };
  }
  const supabase = await createClient();
  const [unreadResult, notificationResult] = await Promise.all([
    loadVisibleNotificationIds(supabase, null, true),
    loadVisibleNotificationIds(supabase, 6, false),
  ]);
  const notificationError = unreadResult.error ?? notificationResult.error;
  const unreadIds = unreadResult.ids;
  const notificationIds = notificationResult.ids;
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
      return {
        items: [],
        unread: 0,
        unreadIds: [],
        error: "Could not load notifications.",
      };
    }
    data = fallback.data;
  }

  return {
    items: ((data ?? []) as NotificationWithContext[]).map((notification) => ({
      ...notification,
      request: notification.request ?? null,
    })),
    unread: unreadIds.length,
    unreadIds,
    error: notificationError,
  };
}

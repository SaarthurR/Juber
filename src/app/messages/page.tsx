import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { NotificationCard } from "@/components/notification-card";
import { NotificationsMarkRead } from "@/components/notifications-mark-read";
import type { Message, Profile, NotificationWithContext } from "@/lib/types";

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
  const supabase = await createClient();

  // Unread count drives the tab badge (and is consistent with the navbar badge).
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null);

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

      {showNotifications ? (
        <NotificationsTab userId={user.id} hasUnread={(unreadCount ?? 0) > 0} />
      ) : (
        <MessagesTab userId={user.id} />
      )}
    </div>
  );
}

async function MessagesTab({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);
  const convoIds = (mine ?? []).map((r) => r.conversation_id);

  let threads: {
    id: string;
    other: Profile | null;
    last: Message | null;
  }[] = [];

  if (convoIds.length) {
    const { data: others } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user:profiles!conversation_participants_user_id_fkey(*)")
      .in("conversation_id", convoIds)
      .neq("user_id", userId);

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: false });

    threads = convoIds.map((id) => {
      const other =
        (others?.find((o) => o.conversation_id === id)?.user as unknown as Profile) ?? null;
      const last = (messages as Message[] | null)?.find((m) => m.conversation_id === id) ?? null;
      return { id, other, last };
    });

    threads.sort((a, b) =>
      (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""),
    );
  }

  if (threads.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
        No conversations yet. Message a driver from a ride to start chatting.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {threads.map((t) => (
        <li key={t.id}>
          <Link href={`/messages/${t.id}`} className="flex items-center gap-3 p-4 hover:bg-stone-50">
            <Avatar src={t.other?.avatar_url} name={t.other?.full_name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.other?.full_name ?? "Member"}</p>
              <p className="truncate text-sm text-stone-500">
                {t.last?.body ?? "Say hello 👋"}
              </p>
            </div>
            {t.last && (
              <span className="shrink-0 text-xs text-stone-400">
                {formatDistanceToNow(new Date(t.last.created_at), { addSuffix: true })}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function NotificationsTab({ userId, hasUnread }: { userId: string; hasUnread: boolean }) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select(
      "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), request:ride_requests!notifications_request_id_fkey(id,origin_label,destination_label,depart_at,status)",
    )
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const notifications = (data as NotificationWithContext[] | null) ?? [];

  if (notifications.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
        No notifications yet. You&apos;ll hear here when there&apos;s activity on your rides.
      </p>
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
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
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

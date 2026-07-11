import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { NotificationCard } from "@/components/notification-card";
import { MessagesList } from "@/components/messages-list";
import type { Message, Profile, NotificationWithContext } from "@/lib/types";
import type { ConversationMembership, ThreadSummary } from "@/lib/messages";

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
    .select("conversation_id, hidden_at")
    .eq("user_id", userId);
  const memberships = ((mine as ConversationMembership[] | null) ?? []);
  const convoIds = memberships.map((r) => r.conversation_id);

  let threads: ThreadSummary[] = [];

  if (convoIds.length) {
    const { data: others } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user:profiles!conversation_participants_user_id_fkey(*)")
      .in("conversation_id", convoIds)
      .neq("user_id", userId);

    const summaries = await Promise.all(memberships.map(async (membership): Promise<ThreadSummary | null> => {
      const other =
        ((others?.find((o) => o.conversation_id === membership.conversation_id)?.user ?? null) as
          | Profile
          | null);
      let latestQuery = supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", membership.conversation_id)
        .order("created_at", { ascending: false })
        .limit(1);
      let unreadQuery = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", membership.conversation_id)
        .neq("sender_id", userId)
        .is("read_at", null);
      if (membership.hidden_at !== null) {
        latestQuery = latestQuery.gt("created_at", membership.hidden_at);
        unreadQuery = unreadQuery.gt("created_at", membership.hidden_at);
      }
      const [{ data: latest, error: latestError }, { count, error: unreadError }] =
        await Promise.all([latestQuery, unreadQuery]);
      if (latestError) console.error("messages latest failed", latestError.message);
      if (unreadError) console.error("messages unread count failed", unreadError.message);
      const last = ((latest as Message[] | null) ?? [])[0] ?? null;
      if (membership.hidden_at !== null && !last) return null;
      return {
        id: membership.conversation_id,
        other,
        last,
        unread: count ?? 0,
        hiddenAt: membership.hidden_at,
      } satisfies ThreadSummary;
    }));

    threads = summaries.filter((summary): summary is ThreadSummary => summary !== null);

    threads.sort((a, b) =>
      (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""),
    );
  }

  return <MessagesList userId={userId} initialThreads={threads} />;
}

async function NotificationsTab({ userId }: { userId: string; hasUnread: boolean }) {
  const supabase = await createClient();

  const notificationsResult = await supabase
    .from("notifications")
    .select(
      "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), request:ride_requests!notifications_request_id_fkey(id,origin_label,destination_label,depart_at,status)",
    )
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  let data = notificationsResult.data;
  if (notificationsResult.error) {
    const fallback = await supabase
      .from("notifications")
      .select(
        "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status)",
      )
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    data = fallback.data;
  }

  const notifications = (((data as NotificationWithContext[] | null) ?? []).map((n) => ({
    ...n,
    request: n.request ?? null,
  })));

  if (notifications.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
        No notifications yet. You&apos;ll hear here when there&apos;s activity on your rides.
      </p>
    );
  }

  return (
    <>
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

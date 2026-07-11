import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { SubHeader } from "@/components/mobile/sub-header";
import { MessagesList } from "@/components/messages-list";
import type { Message, Profile } from "@/lib/types";
import type { ConversationMembership, ThreadSummary } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Mobile inbox. Mirrors the desktop /messages list but stays inside the /m
// phone shell so the bottom nav / chrome is consistent, and links each thread
// to /m/messages/[id] instead of the desktop route.
export default async function MobileMessagesPage() {
  const { user } = await getCurrentUser();
  if (!user) redirect("/m");
  const supabase = await createClient();

  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id, hidden_at")
    .eq("user_id", user.id);
  const memberships = ((mine as ConversationMembership[] | null) ?? []);
  const convoIds = memberships.map((r) => r.conversation_id);

  let threads: ThreadSummary[] = [];

  if (convoIds.length) {
    const { data: others } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user:profiles!conversation_participants_user_id_fkey(*)")
      .in("conversation_id", convoIds)
      .neq("user_id", user.id);

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
        .neq("sender_id", user.id)
        .is("read_at", null);
      if (membership.hidden_at !== null) {
        latestQuery = latestQuery.gt("created_at", membership.hidden_at);
        unreadQuery = unreadQuery.gt("created_at", membership.hidden_at);
      }
      const [{ data: latest, error: latestError }, { count, error: unreadError }] =
        await Promise.all([latestQuery, unreadQuery]);
      if (latestError) console.error("mobile messages latest failed", latestError.message);
      if (unreadError) console.error("mobile messages unread count failed", unreadError.message);
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

  return (
    <div className="pb-28">
      <SubHeader
        title="Messages"
        pill={threads.length ? `${threads.length}` : undefined}
        backFallback="/m"
      />
      <div className="px-4 pt-1">
        <MessagesList userId={user.id} initialThreads={threads} basePath="/m/messages" />
      </div>
    </div>
  );
}

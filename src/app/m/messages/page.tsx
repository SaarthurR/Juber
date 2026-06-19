import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { SubHeader } from "@/components/mobile/sub-header";
import { MessagesList, type ThreadSummary } from "@/components/messages-list";
import type { Message, Profile } from "@/lib/types";

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
    .select("conversation_id")
    .eq("user_id", user.id);
  const convoIds = (mine ?? []).map((r) => r.conversation_id);

  let threads: ThreadSummary[] = [];

  if (convoIds.length) {
    const { data: others } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user:profiles!conversation_participants_user_id_fkey(*)")
      .in("conversation_id", convoIds)
      .neq("user_id", user.id);

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: false });

    threads = convoIds.map((id) => {
      const other =
        (others?.find((o) => o.conversation_id === id)?.user as unknown as Profile) ?? null;
      const inThread = ((messages as Message[] | null) ?? []).filter(
        (m) => m.conversation_id === id,
      );
      const last = inThread[0] ?? null;
      const unread = inThread.filter((m) => m.sender_id !== user.id && !m.read_at).length;
      return { id, other, last, unread };
    });

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

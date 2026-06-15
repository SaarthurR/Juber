import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import type { Message, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const { user } = await getCurrentUser();
  if (!user) redirect("/");
  const supabase = await createClient();

  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);
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
      .neq("user_id", user.id);

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

    // Most recently active first.
    threads.sort((a, b) =>
      (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""),
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Messages</h1>
      {threads.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
          No conversations yet. Message a driver from a ride to start chatting.
        </p>
      ) : (
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
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markConversationRead } from "@/app/messages/actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Message, Profile } from "@/lib/types";

export type ThreadSummary = {
  id: string;
  other: Profile | null;
  last: Message | null;
  unread: number;
};

export function MessagesList({
  userId,
  initialThreads,
}: {
  userId: string;
  initialThreads: ThreadSummary[];
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const initialKey = useMemo(
    () => initialThreads.map((t) => `${t.id}:${t.last?.id ?? ""}:${t.unread}`).join("|"),
    [initialThreads],
  );
  const [syncedTo, setSyncedTo] = useState(initialKey);

  if (syncedTo !== initialKey) {
    setSyncedTo(initialKey);
    setThreads(initialThreads);
  }

  const refreshThreads = useCallback(async () => {
    const supabase = createClient();
    const { data: mine } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId);
    const convoIds = (mine ?? []).map((row) => row.conversation_id);
    if (!convoIds.length) {
      setThreads([]);
      return;
    }

    const [{ data: others }, { data: messages }] = await Promise.all([
      supabase
        .from("conversation_participants")
        .select("conversation_id, user:profiles!conversation_participants_user_id_fkey(*)")
        .in("conversation_id", convoIds)
        .neq("user_id", userId),
      supabase
        .from("messages")
        .select("*")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false }),
    ]);

    const messageRows = (messages as Message[] | null) ?? [];
    const next = convoIds.map((id) => {
      const other =
        (others?.find((o) => o.conversation_id === id)?.user as unknown as Profile) ?? null;
      const inThread = messageRows.filter((m) => m.conversation_id === id);
      return {
        id,
        other,
        last: inThread[0] ?? null,
        unread: inThread.filter((m) => m.sender_id !== userId && !m.read_at).length,
      };
    });

    next.sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
    setThreads(next);
  }, [userId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => void refreshThreads(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        () => void refreshThreads(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshThreads]);

  function markRead(conversationId: string) {
    setPendingId(conversationId);
    setThreads((prev) =>
      prev.map((t) => (t.id === conversationId ? { ...t, unread: 0 } : t)),
    );
    startTransition(async () => {
      try {
        await markConversationRead(conversationId);
      } finally {
        setPendingId(null);
      }
    });
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
      {threads.map((thread) => {
        const unread = thread.unread > 0;
        return (
          <li key={thread.id}>
            <div
              className={cn(
                "group relative flex items-center gap-3 p-4 transition",
                unread ? "bg-brand-50/60" : "hover:bg-stone-50",
              )}
            >
              <Link href={`/messages/${thread.id}`} className="absolute inset-0" aria-label={`Open chat with ${thread.other?.full_name ?? "Member"}`} />
              <Avatar src={thread.other?.avatar_url} name={thread.other?.full_name} size={44} />
              <div className="relative min-w-0 flex-1">
                <p className={cn("truncate font-medium", unread && "text-brand-800")}>
                  {thread.other?.full_name ?? "Member"}
                </p>
                <p className={cn("truncate text-sm", unread ? "font-semibold text-stone-700" : "text-stone-500")}>
                  {thread.last?.body ?? "Say hello"}
                </p>
              </div>
              <div className="relative flex shrink-0 flex-col items-end gap-2">
                {thread.last && (
                  <span className="text-xs text-stone-400">
                    {formatDistanceToNow(new Date(thread.last.created_at), { addSuffix: true })}
                  </span>
                )}
                {unread ? (
                  <button
                    type="button"
                    disabled={pendingId === thread.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      markRead(thread.id);
                    }}
                    aria-label="Mark conversation read"
                    title="Mark read"
                    className="h-3 w-3 rounded-full bg-gold shadow-[0_0_0_4px_rgba(232,200,135,0.28),0_0_16px_rgba(194,129,12,0.55)] transition hover:scale-125 disabled:opacity-50"
                  />
                ) : thread.last?.sender_id === userId && thread.last.read_at ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <CheckCheck size={13} />
                    Read
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

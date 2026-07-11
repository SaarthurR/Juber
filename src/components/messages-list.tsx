"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CheckCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteConversation } from "@/app/messages/actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Message, Profile } from "@/lib/types";
import type { ConversationMembership, ThreadSummary } from "@/lib/messages";

export function MessagesList({
  userId,
  initialThreads,
  basePath = "/messages",
}: {
  userId: string;
  initialThreads: ThreadSummary[];
  /** Route prefix for thread links — "/m/messages" keeps mobile in the phone shell. */
  basePath?: string;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const refreshVersion = useRef(0);
  const initialKey = useMemo(
    () =>
      initialThreads
        .map((t) =>
          [
            t.id,
            t.other?.full_name ?? "",
            t.other?.avatar_url ?? "",
            t.last?.id ?? "",
            t.last?.body ?? "",
            t.last?.created_at ?? "",
            t.last?.read_at ?? "",
            t.unread,
            t.hiddenAt ?? "",
          ].join(":"),
        )
        .join("|"),
    [initialThreads],
  );
  const [syncedTo, setSyncedTo] = useState(initialKey);

  if (syncedTo !== initialKey) {
    setSyncedTo(initialKey);
    setThreads(initialThreads);
  }

  const refreshThreads = useCallback(async () => {
    const version = ++refreshVersion.current;
    const supabase = createClient();
    const { data: mine } = await supabase
      .from("conversation_participants")
      .select("conversation_id, hidden_at")
      .eq("user_id", userId);
    const memberships = ((mine as ConversationMembership[] | null) ?? []);
    const convoIds = memberships.map((row) => row.conversation_id);
    if (!convoIds.length) {
      if (version !== refreshVersion.current) return;
      setThreads([]);
      return;
    }

    const { data: others } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user:profiles!conversation_participants_user_id_fkey(*)")
      .in("conversation_id", convoIds)
      .neq("user_id", userId);

    const summaries = await Promise.all(memberships.map(async (membership) => {
      const other =
        (others?.find((o) => o.conversation_id === membership.conversation_id)
          ?.user as unknown as Profile) ?? null;
      const summary = await fetchThreadSummary(membership, other, userId);
      return summary;
    }));
    const next = summaries.filter((summary): summary is ThreadSummary => summary !== null);

    next.sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
    if (version !== refreshVersion.current) return;
    setThreads(next);
  }, [userId]);

  const refreshThread = useCallback(async (conversationId: string) => {
    const version = ++refreshVersion.current;
    const supabase = createClient();
    const [{ data: mine }, { data: otherRows }] = await Promise.all([
      supabase
        .from("conversation_participants")
        .select("conversation_id, hidden_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .maybeSingle<ConversationMembership>(),
      supabase
        .from("conversation_participants")
        .select("conversation_id, user:profiles!conversation_participants_user_id_fkey(*)")
        .eq("conversation_id", conversationId)
        .neq("user_id", userId),
    ]);

    const other =
      (otherRows?.find((row) => row.conversation_id === conversationId)
        ?.user as unknown as Profile) ?? null;
    const nextThread = mine ? await fetchThreadSummary(mine, other, userId) : null;

    if (version !== refreshVersion.current) return;
    setThreads((prev) => {
      const without = prev.filter((thread) => thread.id !== conversationId);
      if (!nextThread) return without;
      const next = [nextThread, ...without];
      next.sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
      return next;
    });
  }, [userId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          setThreads((prev) => {
            const index = prev.findIndex((thread) => thread.id === msg.conversation_id);
            if (index === -1) {
              void refreshThread(msg.conversation_id);
              return prev;
            }

            const next = [...prev];
            const existing = next[index];
            if (existing.last?.id === msg.id) return prev;
            if (existing.hiddenAt !== null && msg.created_at <= existing.hiddenAt) return prev;
            next[index] = {
              ...existing,
              last:
                !existing.last || msg.created_at >= existing.last.created_at
                  ? msg
                  : existing.last,
              unread:
                msg.sender_id !== userId && !msg.read_at
                  ? existing.unread + 1
                  : existing.unread,
            };
            next.sort((a, b) =>
              (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""),
            );
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          setThreads((prev) =>
            prev.map((thread) =>
              thread.id === msg.conversation_id && thread.last?.id === msg.id
                ? { ...thread, last: msg }
                : thread,
            ),
          );
          void refreshThread(msg.conversation_id);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        () => void refreshThreads(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_participants" },
        () => void refreshThreads(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_participants" },
        () => void refreshThreads(),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "conversation_participants" },
        () => void refreshThreads(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshThread, refreshThreads]);

  function removeChat(conversationId: string, name: string) {
    if (!window.confirm(`Delete your chat with ${name}?`)) return;
    setDeletingId(conversationId);
    setThreads((prev) => prev.filter((t) => t.id !== conversationId));
    startTransition(async () => {
      try {
        await deleteConversation(conversationId);
        await refreshThreads();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Could not delete this chat.");
        await refreshThreads();
      } finally {
        setDeletingId(null);
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
                "group flex items-center gap-3 p-4 transition",
                unread ? "bg-brand-50/60" : "hover:bg-stone-50",
              )}
            >
              <Link
                href={`${basePath}/${thread.id}`}
                prefetch
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar src={thread.other?.avatar_url} name={thread.other?.full_name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-medium", unread && "text-brand-800")}>
                    {thread.other?.full_name ?? "Member"}
                  </p>
                  <p className={cn("truncate text-sm", unread ? "font-semibold text-stone-700" : "text-stone-500")}>
                    {thread.last?.body ?? "Say hello"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {thread.last && (
                    <span className="text-xs text-stone-400">
                      {formatDistanceToNow(new Date(thread.last.created_at), { addSuffix: true })}
                    </span>
                  )}
                  {unread ? (
                    <span
                      aria-label="Unread"
                      className="h-3 w-3 rounded-full bg-gold shadow-[0_0_0_4px_rgba(232,200,135,0.28),0_0_16px_rgba(194,129,12,0.55)]"
                    />
                  ) : thread.last?.sender_id === userId && thread.last.read_at ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCheck size={13} />
                      Read
                    </span>
                  ) : null}
                </div>
              </Link>
              <button
                type="button"
                disabled={deletingId === thread.id}
                onClick={() => removeChat(thread.id, thread.other?.full_name ?? "Member")}
                aria-label={`Delete chat with ${thread.other?.full_name ?? "Member"}`}
                title="Delete chat"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-300 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={17} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function fetchThreadSummary(
  membership: ConversationMembership,
  other: Profile | null,
  userId: string,
): Promise<ThreadSummary | null> {
  const supabase = createClient();
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

  const [{ data: latest, error: latestError }, { count, error: unreadError }] = await Promise.all([
    latestQuery,
    unreadQuery,
  ]);
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
  };
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CheckCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteConversation } from "@/app/messages/actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";
import {
  loadThreadSummaries,
  mergeFullThreadSnapshot,
  nextArchiveRefreshDelay,
  replaceThreadSummary,
  type ThreadSummary,
} from "@/lib/messages";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fullRefreshVersion = useRef(0);
  const threadRefreshVersions = useRef(new Map<string, number>());
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
            t.archiveState,
            t.contextKey,
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
    const version = ++fullRefreshVersion.current;
    const startedVersions = new Map(threadRefreshVersions.current);
    try {
      const next = await loadThreadSummaries(createClient(), userId);
      if (version !== fullRefreshVersion.current) return;
      setThreads((previous) =>
        mergeFullThreadSnapshot(
          previous,
          next,
          startedVersions,
          threadRefreshVersions.current,
        ),
      );
      setLoadError(null);
    } catch {
      if (version !== fullRefreshVersion.current) return;
      setLoadError("Could not refresh conversations. Showing the last loaded inbox.");
    }
  }, [userId]);

  const refreshThread = useCallback(async (conversationId: string) => {
    const version = (threadRefreshVersions.current.get(conversationId) ?? 0) + 1;
    threadRefreshVersions.current.set(conversationId, version);
    try {
      const [nextThread] = await loadThreadSummaries(
        createClient(),
        userId,
        conversationId,
      );
      if (threadRefreshVersions.current.get(conversationId) !== version) {
        return;
      }
      setThreads((prev) => {
        const without = prev.filter((thread) => thread.id !== conversationId);
        return nextThread ? replaceThreadSummary(prev, nextThread) : without;
      });
      setLoadError(null);
    } catch {
      if (threadRefreshVersions.current.get(conversationId) !== version) return;
      setLoadError("Could not refresh a conversation. Showing its last loaded state.");
    }
  }, [userId]);

  useEffect(() => {
    const supabase = createClient();
    function refreshExactThread(conversationId: string) {
      void refreshThread(conversationId);
    }
    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          refreshExactThread(msg.conversation_id);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          refreshExactThread(msg.conversation_id);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_participants" },
        (payload) => {
          const row = payload.new as { conversation_id: string };
          refreshExactThread(row.conversation_id);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshThreads();
      });

    function onVisible() {
      if (document.visibilityState === "visible") void refreshThreads();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [userId, refreshThread, refreshThreads]);

  useEffect(() => {
    const delay = nextArchiveRefreshDelay(threads, new Date().toISOString());
    if (delay === null) return;
    const timeout = window.setTimeout(() => {
      void refreshThreads();
    }, Math.min(delay + 50, 2_147_483_647));
    return () => window.clearTimeout(timeout);
  }, [threads, refreshThreads]);

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

  const activeThreads = threads.filter((thread) => thread.archiveState === "active");
  const archivedThreads = threads.filter((thread) => thread.archiveState === "archived");

  return (
    <div className="space-y-6">
      {loadError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </p>
      )}
      {threads.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
          No conversations yet. Message a driver from a ride to start chatting.
        </p>
      ) : (
        <>
          <ThreadSection
            title="Active"
            emptyLabel="No active conversations."
            threads={activeThreads}
            userId={userId}
            basePath={basePath}
            deletingId={deletingId}
            onDelete={removeChat}
          />
          <ThreadSection
            title="Past/Archived"
            emptyLabel="No past conversations."
            threads={archivedThreads}
            userId={userId}
            basePath={basePath}
            deletingId={deletingId}
            onDelete={removeChat}
          />
        </>
      )}
    </div>
  );
}

function ThreadSection({
  title,
  emptyLabel,
  threads,
  userId,
  basePath,
  deletingId,
  onDelete,
}: {
  title: string;
  emptyLabel: string;
  threads: ThreadSummary[];
  userId: string;
  basePath: string;
  deletingId: string | null;
  onDelete: (conversationId: string, name: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-stone-500">{title}</h2>
      {threads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 px-4 py-5 text-sm text-stone-400">
          {emptyLabel}
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {threads.map((thread) => {
            const unread = thread.unread > 0;
            const name = thread.other?.full_name ?? "Member";
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
                        {name}
                      </p>
                      <p
                        className={cn(
                          "truncate text-sm",
                          unread ? "font-semibold text-stone-700" : "text-stone-500",
                        )}
                      >
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
                    onClick={() => onDelete(thread.id, name)}
                    aria-label={`Delete chat with ${name}`}
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
      )}
    </section>
  );
}

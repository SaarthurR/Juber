"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markConversationRead, sendMessage } from "@/app/messages/actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  archiveRefreshDelay,
  archiveTimeoutChunk,
  isCurrentCatchUp,
  lifecycleRefreshTarget,
  mergeMessageWindow,
} from "@/lib/messages";
import type { ThreadContext } from "@/lib/messages";
import type { Message, Profile } from "@/lib/types";

type ProfileBase = "/profile" | "/m/profile";
type SendState = {
  pendingId: string;
  body: string;
  status: "sending" | "failed";
  error: string | null;
};

export function MessageThread({
  conversationId,
  currentUserId,
  other,
  initialMessages,
  backHref = "/messages",
  profileBase = "/profile",
  archiveState,
  hiddenAt,
  departAt,
  contextKind,
  contextId,
}: {
  conversationId: string;
  currentUserId: string;
  other: Profile | null;
  initialMessages: Message[];
  /** Where the back arrow returns to — "/m/messages" on the mobile shell. */
  backHref?: string;
  profileBase?: ProfileBase;
  archiveState: "active" | "archived";
  hiddenAt: string | null;
  departAt: string | null;
  contextKind: ThreadContext["kind"];
  contextId: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sendState, setSendState] = useState<SendState | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  const sendStateRef = useRef(sendState);
  const mountedRef = useRef(true);
  const catchUpGeneration = useRef(0);

  useEffect(() => {
    sendStateRef.current = sendState;
  }, [sendState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      catchUpGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    function mergeIncoming(incoming: Message[]) {
      if (!mountedRef.current) return;
      const pendingId = sendStateRef.current?.pendingId ?? null;
      const result = mergeMessageWindow(messagesRef.current, incoming, pendingId);
      messagesRef.current = result.messages;
      setMessages(result.messages);
      if (result.pendingConfirmed && pendingId) {
        sendStateRef.current = null;
        setSendState(null);
        setDraft("");
      }
    }
    async function catchUp() {
      const generation = ++catchUpGeneration.current;
      let query = supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (hiddenAt) query = query.gt("created_at", hiddenAt);
      const { data, error } = await query;
      if (
        !mountedRef.current ||
        !isCurrentCatchUp(generation, catchUpGeneration.current)
      ) {
        return;
      }
      if (error) {
        setSyncError("Could not refresh recent messages.");
        return;
      }
      mergeIncoming((data as Message[] | null) ?? []);
      setSyncError(null);
    }
    let channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          mergeIncoming([msg]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          mergeIncoming([msg]);
        },
      );
    const lifecycleTarget = lifecycleRefreshTarget(contextKind, contextId);
    if (lifecycleTarget) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: lifecycleTarget.table,
          filter: lifecycleTarget.filter,
        },
        () => router.refresh(),
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void catchUp();
        router.refresh();
      }
    });

    function onVisible() {
      if (document.visibilityState === "visible") {
        void catchUp();
        router.refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      catchUpGeneration.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [contextId, contextKind, conversationId, hiddenAt, router]);

  useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;
    function schedule() {
      const remaining = archiveRefreshDelay(
        departAt,
        archiveState,
        new Date().toISOString(),
      );
      if (cancelled || remaining === null) return;
      const chunk = archiveTimeoutChunk(remaining);
      timeout = window.setTimeout(() => {
        if (cancelled) return;
        if (chunk.refreshAtEnd) {
          router.refresh();
        } else {
          schedule();
        }
      }, chunk.delay);
    }
    schedule();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [archiveState, departAt, router]);

  // Mark inbound messages read. Realtime pushes mutate `messages` frequently, so
  // guard with a ref to avoid overlapping calls, and don't let a failed update
  // throw an unhandled rejection.
  const markingReadRef = useRef(false);
  const rerunMarkReadRef = useRef(false);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const hasUnread = messages.some((m) => m.sender_id !== currentUserId && !m.read_at);
    if (!hasUnread) return;
    if (markingReadRef.current) {
      rerunMarkReadRef.current = true;
      return;
    }

    function runMarkRead() {
      markingReadRef.current = true;
      rerunMarkReadRef.current = false;
      markConversationRead(conversationId)
        .then(() => {
          if (mountedRef.current) setReadError(null);
        })
        .catch(() => {
          if (mountedRef.current) {
            setReadError("Could not update read status. Messages remain available.");
          }
        })
        .finally(() => {
          markingReadRef.current = false;
          const shouldRerun =
            mountedRef.current &&
            rerunMarkReadRef.current &&
            messagesRef.current.some((m) => m.sender_id !== currentUserId && !m.read_at);
          if (shouldRerun) runMarkRead();
        });
    }

    runMarkRead();
  }, [conversationId, currentUserId, messages]);

  useEffect(() => {
    // Scroll only the message list, not the window — scrollIntoView would
    // bubble up and scroll the whole page (header + messages off-screen).
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendStateRef.current) return;
    const body = draft.trim();
    if (!body) return;

    const pendingId = crypto.randomUUID();
    const pendingMessage: Message = {
      id: pendingId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
    };

    setMessages((prev) => {
      const next = [...prev, pendingMessage];
      messagesRef.current = next;
      return next;
    });
    await performSend(body, pendingId);
  }

  async function performSend(body: string, pendingId: string) {
    if (sendStateRef.current?.status === "sending") return;
    const sending: SendState = { pendingId, body, status: "sending", error: null };
    sendStateRef.current = sending;
    setSendState(sending);
    try {
      const formData = new FormData();
      formData.set("body", body);
      formData.set("client_message_id", pendingId);
      const result = await sendMessage(conversationId, formData);
      if (result.error || !result.message) {
        if (sendStateRef.current?.pendingId !== pendingId) return;
        const failed: SendState = {
          pendingId,
          body,
          status: "failed",
          error: result.error ?? "Could not send this message. Please try again.",
        };
        sendStateRef.current = failed;
        setSendState(failed);
        return;
      }

      const merged = mergeMessageWindow(
        messagesRef.current,
        [result.message],
        pendingId,
      );
      messagesRef.current = merged.messages;
      setMessages(merged.messages);
      sendStateRef.current = null;
      setSendState(null);
      setDraft("");
    } catch {
      if (sendStateRef.current?.pendingId !== pendingId) return;
      const failed: SendState = {
        pendingId,
        body,
        status: "failed",
        error: "Could not send this message. Please try again.",
      };
      sendStateRef.current = failed;
      setSendState(failed);
    }
  }

  const lastMessage = messages.findLast((message) => message.id !== sendState?.pendingId);
  const receiptMessageId =
    lastMessage?.sender_id === currentUserId ? lastMessage.id : null;

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 sm:px-6">
      <div className="flex items-center gap-3 border-b border-stone-200 py-4">
        <Link
          href={backHref}
          aria-label="Back to all chats"
          className="flex h-9 w-9 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50"
        >
          <ArrowLeft size={20} />
        </Link>
        <Avatar src={other?.avatar_url} name={other?.full_name} size={40} />
        <Link href={other ? `${profileBase}/${other.id}` : "#"} className="font-semibold">
          {other?.full_name ?? "Member"}
        </Link>
      </div>

      {archiveState === "archived" && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Past ride — this chat stays available for lost items and follow-up. Phone and WhatsApp
          access ends 24 hours after departure and ends immediately when a ride is closed or
          cancelled.
        </p>
      )}
      {readError && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {readError}
        </p>
      )}
      {syncError && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {syncError}
        </p>
      )}

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-400">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className="flex max-w-[75%] flex-col">
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2 text-sm",
                    mine
                      ? "bg-brand-600 text-white"
                      : "bg-stone-100 text-stone-800",
                  )}
                >
                  {m.body}
                </div>
                {m.id === receiptMessageId && (
                  <span className="mt-1 self-end text-[11px] font-semibold text-stone-400">
                    {m.read_at ? "Read" : "Sent"}
                  </span>
                )}
                {m.id === sendState?.pendingId && (
                  <span className="mt-1 self-end text-[11px] font-semibold text-stone-400">
                    {sendState.status === "sending" ? "Sending…" : "Not sent"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={submitMessage}
        className="border-t border-stone-200 py-4"
      >
        <div className="flex items-center gap-2">
          <input
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={sendState !== null}
            autoComplete="off"
            placeholder="Type a message…"
            className="flex-1 rounded-full border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-stone-100"
          />
          <button
            type="submit"
            disabled={sendState !== null || !draft.trim()}
            aria-label="Send message"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
        {sendState?.status === "failed" && (
          <div
            role="alert"
            className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            <span>{sendState.error}</span>
            <button
              type="button"
              onClick={() => void performSend(sendState.body, sendState.pendingId)}
              className="shrink-0 font-bold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

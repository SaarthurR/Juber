"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markConversationRead } from "@/app/messages/actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { newestThreadMessages } from "@/lib/messages";
import type { Message, Profile } from "@/lib/types";

type ProfileBase = "/profile" | "/m/profile";

export function MessageThread({
  conversationId,
  currentUserId,
  other,
  initialMessages,
  backHref = "/messages",
  profileBase = "/profile",
}: {
  conversationId: string;
  currentUserId: string;
  other: Profile | null;
  initialMessages: Message[];
  /** Where the back arrow returns to — "/m/messages" on the mobile shell. */
  backHref?: string;
  profileBase?: ProfileBase;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const messagesRef = useRef(messages);

  // Subscribe to new messages in this conversation via Supabase Realtime.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
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
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            const pendingIndex = prev.findIndex(
              (m) =>
                m.id.startsWith("pending:") &&
                m.sender_id === msg.sender_id &&
                m.body === msg.body,
            );
            if (pendingIndex === -1) return newestThreadMessages([...prev, msg]);

            const next = [...prev];
            next[pendingIndex] = msg;
            return newestThreadMessages(next);
          });
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
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

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
        .catch((e) => console.error("Failed to mark conversation read:", e))
        .finally(() => {
          markingReadRef.current = false;
          const shouldRerun =
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
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = (formData.get("body") ?? "").toString().trim();
    if (!body) return;

    const pendingId = `pending:${crypto.randomUUID()}`;
    const pendingMessage: Message = {
      id: pendingId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
    };

    formRef.current?.reset();
    setMessages((prev) => newestThreadMessages([...prev, pendingMessage]));

    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        body,
      })
      .select()
      .single<Message>();

    if (error || !data) {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      window.alert(error?.message ?? "Could not send this message.");
      return;
    }

    setMessages((prev) => {
      if (prev.some((m) => m.id === data.id)) {
        return prev.filter((m) => m.id !== pendingId);
      }
      return newestThreadMessages(prev.map((m) => (m.id === pendingId ? data : m)));
    });
  }

  const lastMessage = messages.at(-1);
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
              </div>
            </div>
          );
        })}
      </div>

      <form
        ref={formRef}
        onSubmit={submitMessage}
        className="flex items-center gap-2 border-t border-stone-200 py-4"
      >
        <input
          name="body"
          autoComplete="off"
          placeholder="Type a message…"
          className="flex-1 rounded-full border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

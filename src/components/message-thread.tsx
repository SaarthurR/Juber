"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "@/app/messages/actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Message, Profile } from "@/lib/types";

export function MessageThread({
  conversationId,
  currentUserId,
  other,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  other: Profile | null;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function action(formData: FormData) {
    formRef.current?.reset();
    await sendMessage(conversationId, formData);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 sm:px-6">
      <div className="flex items-center gap-3 border-b border-stone-200 py-4">
        <Link href="/messages" className="text-brand-600 sm:hidden">
          ←
        </Link>
        <Avatar src={other?.avatar_url} name={other?.full_name} size={40} />
        <Link href={other ? `/profile/${other.id}` : "#"} className="font-semibold">
          {other?.full_name ?? "Member"}
        </Link>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-400">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                  mine
                    ? "bg-brand-600 text-white"
                    : "bg-stone-100 text-stone-800",
                )}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        ref={formRef}
        action={action}
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

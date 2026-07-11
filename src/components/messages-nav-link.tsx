"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loadVisibleNotificationIds } from "@/lib/messages";

/**
 * Messages nav item with a combined unread badge for notifications and chats.
 */
export function MessagesNavLink({
  userId,
  initialUnread,
}: {
  userId: string;
  initialUnread: number;
}) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);
  const [syncedTo, setSyncedTo] = useState(initialUnread);

  if (syncedTo !== initialUnread) {
    setSyncedTo(initialUnread);
    setUnread(initialUnread);
  }

  const refreshUnread = useCallback(async () => {
    try {
      const notificationIds = await loadVisibleNotificationIds(createClient(), null, true);
      setUnread(notificationIds.length);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`nav-unread:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        () => void refreshUnread(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        () => void refreshUnread(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshUnread]);

  const active = pathname.startsWith("/messages");
  const visibleUnread = unread;

  return (
    <Link
      href="/messages"
      prefetch
      aria-label="Messages"
      aria-current={active ? "page" : undefined}
      className={`relative ml-1 hidden h-[38px] w-[38px] items-center justify-center rounded-full transition-colors duration-200 hover:bg-tint hover:text-brand-700 sm:flex ${
        active ? "bg-tint text-brand-700 ring-1 ring-brand-200" : "text-[#57534e]"
      }`}
    >
      <MessageSquare size={19} strokeWidth={2} />
      {visibleUnread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {visibleUnread > 9 ? "9+" : visibleUnread}
        </span>
      )}
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * "Messages" nav item with an unread-notifications badge. Seeds from a
 * server-computed count and bumps live via Supabase Realtime on new inserts.
 */
export function MessagesNavLink({
  userId,
  initialUnread,
}: {
  userId: string;
  initialUnread: number;
}) {
  const pathname = usePathname();
  // Realtime arrivals since the last server render of `initialUnread`.
  const [extra, setExtra] = useState(0);
  const [syncedTo, setSyncedTo] = useState(initialUnread);

  // Reset live count whenever the server hands us a fresh truth (render-time
  // adjustment — the React-endorsed alternative to a syncing effect).
  if (syncedTo !== initialUnread) {
    setSyncedTo(initialUnread);
    setExtra(0);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => setExtra((n) => n + 1),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // On the inbox itself, treat as read — the server refresh will confirm.
  const unread = pathname === "/messages" ? 0 : initialUnread + extra;

  return (
    <Link
      href="/messages"
      className="relative rounded-md px-3 py-1.5 transition hover:bg-stone-100 hover:text-stone-900"
    >
      Messages
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

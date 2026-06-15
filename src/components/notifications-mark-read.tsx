"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/messages/actions";

/**
 * Marks the viewer's notifications read once the inbox is shown, then refreshes
 * so the navbar unread badge clears. Renders nothing.
 */
export function NotificationsMarkRead({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (!hasUnread || done.current) return;
    done.current = true;
    (async () => {
      await markNotificationsRead();
      router.refresh();
    })();
  }, [hasUnread, router]);

  return null;
}

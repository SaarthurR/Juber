"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/messages/actions";
import {
  notificationWriteErrorMessage,
  shouldStartNotificationMarkRead,
} from "@/lib/notifications-controller";

/**
 * Marks the viewer's notifications read once the inbox is shown, then refreshes
 * so the navbar unread badge clears. Renders nothing.
 */
export function NotificationsMarkRead({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const done = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const markRead = useCallback(async () => {
    done.current = true;
    setError(null);
    try {
      await markNotificationsRead();
      router.refresh();
    } catch {
      done.current = false;
      setError(notificationWriteErrorMessage("bulk"));
    }
  }, [router]);

  useEffect(() => {
    if (!shouldStartNotificationMarkRead(hasUnread, done.current)) return;
    void markRead();
  }, [hasUnread, markRead]);

  return error ? (
    <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
      <span>{error}</span>
      <button
        type="button"
        onClick={() => void markRead()}
        className="rounded-full bg-white px-3 py-1 text-xs font-bold text-red-700"
      >
        Retry
      </button>
    </div>
  ) : null;
}

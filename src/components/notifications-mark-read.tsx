"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/messages/actions";

/**
 * Marks the viewer's notifications read once the inbox is shown, then refreshes
 * so the navbar unread badge clears. Renders nothing.
 */
export function NotificationsMarkRead({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const done = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasUnread || done.current) return;
    done.current = true;
    (async () => {
      try {
        await markNotificationsRead();
        router.refresh();
      } catch {
        done.current = false;
        setError("Could not mark notifications read.");
      }
    })();
  }, [hasUnread, router]);

  return error ? (
    <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </p>
  ) : null;
}

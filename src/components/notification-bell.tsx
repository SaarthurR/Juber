"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Car, Check, X, Ban, Handshake, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/app/messages/actions";
import type { NotificationWithContext, NotificationType } from "@/lib/types";

const NOTIFICATION_SELECT =
  "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), request:ride_requests!notifications_request_id_fkey(id,origin_label,destination_label,depart_at,status)";

const FALLBACK_NOTIFICATION_SELECT =
  "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status)";

const ICON: Record<NotificationType, React.ComponentType<{ size?: number; className?: string }>> = {
  seat_requested: Car,
  seat_confirmed: Check,
  seat_declined: X,
  seat_cancelled: Ban,
  ride_cancelled: Ban,
  request_accepted: Handshake,
  new_message: MessageCircle,
};

// Warm per-type chip colors, echoing the mock's varied avatars.
const CHIP: Record<NotificationType, string> = {
  seat_confirmed: "bg-[#dcfce7] text-[#15803d]",
  seat_requested: "bg-[#f3e7d8] text-[#8a5a2b]",
  seat_declined: "bg-[#fee2e2] text-[#b91c1c]",
  seat_cancelled: "bg-[#fee2e2] text-[#b91c1c]",
  ride_cancelled: "bg-[#fee2e2] text-[#b91c1c]",
  request_accepted: "bg-[#dcfce7] text-[#15803d]",
  new_message: "bg-[#e0f2fe] text-[#0369a1]",
};

function firstName(name: string | null | undefined) {
  return name?.split(" ")[0] ?? "Someone";
}

function copyFor(n: NotificationWithContext) {
  const who = firstName(n.actor?.full_name);
  const route = n.ride
    ? `${n.ride.origin_label} → ${n.ride.destination_label}`
    : n.request
      ? `${n.request.origin_label} → ${n.request.destination_label}`
    : null;
  switch (n.type) {
    case "seat_confirmed":
      return (
        <>
          <strong>{who}</strong> confirmed your seat{route && <> for {route}</>}.
        </>
      );
    case "seat_requested":
      return (
        <>
          <strong>{who}</strong> reserved a seat{route && <> on {route}</>}.
        </>
      );
    case "seat_declined":
      return <>Your seat request{route && <> for {route}</>} was declined.</>;
    case "seat_cancelled":
      return (
        <>
          <strong>{who}</strong> cancelled their seat{route && <> for {route}</>}.
        </>
      );
    case "ride_cancelled":
      return <>Your ride{route && <> {route}</>} was cancelled.</>;
    case "request_accepted":
      return (
        <>
          <strong>{who}</strong> accepted your ride request{route && <> for {route}</>}.
        </>
      );
    case "new_message":
      return (
        <>
          One new message from <strong>{who}</strong>.
        </>
      );
  }
}

export function NotificationBell({
  initial,
  initialUnread,
  userId,
}: {
  initial: NotificationWithContext[];
  initialUnread: number;
  userId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const initialKey = `${initialUnread}:${initial.map((n) => n.id).join(",")}`;
  const [syncedTo, setSyncedTo] = useState(initialKey);
  const ref = useRef<HTMLDivElement>(null);

  const refreshNotifications = useCallback(async () => {
    const supabase = createClient();
    const [{ count }, notificationsResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null),
      supabase
        .from("notifications")
        .select(NOTIFICATION_SELECT)
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    let data = notificationsResult.data;
    if (notificationsResult.error) {
      const fallback = await supabase
        .from("notifications")
        .select(FALLBACK_NOTIFICATION_SELECT)
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(6);
      data = fallback.data;
    }

    setUnread(count ?? 0);
    setItems(((data ?? []) as NotificationWithContext[]).map((n) => ({ ...n, request: n.request ?? null })));
  }, [userId]);

  // Keep in sync when the server hands fresh data on navigation. This render-time
  // adjustment avoids the extra cascading render that a syncing effect would add.
  if (syncedTo !== initialKey) {
    setSyncedTo(initialKey);
    setUnread(initialUnread);
    setItems(initial);
  }

  // Live arrivals bump the dot + refresh the server data.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bell:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          setUnread((n) => n + 1);
          void refreshNotifications();
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router, refreshNotifications]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshNotifications();
    }, 10000);
    function onVisible() {
      if (document.visibilityState === "visible") void refreshNotifications();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshNotifications]);

  // Click-out + Esc close the popover.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await markNotificationsRead();
    router.refresh();
  }

  async function markOneRead(id: string) {
    const readAt = new Date().toISOString();
    const target = items.find((n) => n.id === id);
    if (!target || target.read_at) return;

    setUnread((n) => Math.max(0, n - 1));
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: readAt } : n)));

    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", id)
      .eq("recipient_id", userId);
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            if (next) void refreshNotifications();
            return next;
          });
        }}
        aria-label="Notifications"
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full bg-tint text-brand-600 transition hover:brightness-95 active:scale-95"
      >
        <Bell size={19} strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute right-[7px] top-[6px] h-2 w-2 rounded-full bg-[#c2410c] ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="motion-popover absolute right-0 top-[48px] z-50 w-[340px] overflow-hidden rounded-2xl border border-[#efe4d3] bg-white shadow-[0_24px_50px_-16px_rgba(92,59,46,0.3)]">
          <div className="flex items-center justify-between border-b border-[#f3ece1] px-[18px] py-4">
            <span className="text-base font-extrabold text-ink">Notifications</span>
            <button
              onClick={markAllRead}
              className="whitespace-nowrap text-[13px] font-bold text-brand-600 transition hover:text-brand-700"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-[18px] py-8 text-center text-sm text-stone-400">
                No notifications yet.
              </p>
            ) : (
              items.map((n) => {
                const Icon = ICON[n.type] ?? Bell;
                const isUnread = !n.read_at;
                const inner = (
                  <div
                    className={`flex items-start gap-3 border-b border-[#f3ece1] px-[18px] py-3.5 transition last:border-b-0 ${
                      isUnread ? "bg-[#fbf6ee]" : ""
                    } hover:bg-[#fbf6ee]`}
                  >
                    <span
                      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ${CHIP[n.type]}`}
                    >
                      <Icon size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-snug text-ink">{copyFor(n)}</div>
                      <div className="mt-0.5 text-xs text-[#b0a08d]">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    {isUnread && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                    )}
                  </div>
                );
                const href = n.ride_id
                  ? `/rides/${n.ride_id}`
                  : n.request_id
                    ? `/requests/${n.request_id}`
                    : n.conversation_id
                      ? `/messages/${n.conversation_id}`
                      : null;
                return href ? (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => {
                      setOpen(false);
                      void markOneRead(n.id);
                    }}
                    className="block"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })
            )}
          </div>

          <Link
            href="/messages?tab=notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-[#f3ece1] px-[18px] py-3 text-center text-[13px] font-bold text-brand-600 transition hover:bg-[#fbf6ee]"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

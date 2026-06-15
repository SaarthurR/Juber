"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Car, Check, X, Ban } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/app/messages/actions";
import type { NotificationWithContext, NotificationType } from "@/lib/types";

const ICON: Record<NotificationType, React.ComponentType<{ size?: number; className?: string }>> = {
  seat_requested: Car,
  seat_confirmed: Check,
  seat_declined: X,
  ride_cancelled: Ban,
};

// Warm per-type chip colors, echoing the mock's varied avatars.
const CHIP: Record<NotificationType, string> = {
  seat_confirmed: "bg-[#dcfce7] text-[#15803d]",
  seat_requested: "bg-[#f3e7d8] text-[#8a5a2b]",
  seat_declined: "bg-[#fee2e2] text-[#b91c1c]",
  ride_cancelled: "bg-[#fee2e2] text-[#b91c1c]",
};

function firstName(name: string | null | undefined) {
  return name?.split(" ")[0] ?? "Someone";
}

function copyFor(n: NotificationWithContext) {
  const who = firstName(n.actor?.full_name);
  const route = n.ride
    ? `${n.ride.origin_label} → ${n.ride.destination_label}`
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
    case "ride_cancelled":
      return <>Your ride{route && <> {route}</>} was cancelled.</>;
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
  const ref = useRef<HTMLDivElement>(null);

  // Keep in sync when the server hands fresh data on navigation.
  const [syncedTo, setSyncedTo] = useState(initialUnread);
  if (syncedTo !== initialUnread) {
    setSyncedTo(initialUnread);
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
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full bg-tint text-brand-600 transition hover:brightness-95 active:scale-95"
      >
        <Bell size={19} strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute right-[7px] top-[6px] h-2 w-2 rounded-full bg-[#c2410c] ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[48px] z-50 w-[340px] overflow-hidden rounded-2xl border border-[#efe4d3] bg-white shadow-[0_24px_50px_-16px_rgba(92,59,46,0.3)]">
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
                return n.ride_id ? (
                  <Link key={n.id} href={`/rides/${n.ride_id}`} onClick={() => setOpen(false)} className="block">
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

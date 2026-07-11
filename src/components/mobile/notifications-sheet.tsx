"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Car, Check, X, Ban, Handshake, MessageCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { MAvatar } from "@/components/mobile/m-avatar";
import { markNotificationsRead } from "@/app/messages/actions";
import type { NotificationWithContext, NotificationType } from "@/lib/types";

const ICON: Record<NotificationType, React.ComponentType<{ size?: number; className?: string }>> = {
  seat_requested: Car,
  seat_confirmed: Check,
  seat_declined: X,
  seat_cancelled: Ban,
  ride_cancelled: Ban,
  request_accepted: Handshake,
  new_message: MessageCircle,
};

function firstName(name: string | null | undefined) {
  return name?.split(" ")[0] ?? "Someone";
}

function titleFor(n: NotificationWithContext): string {
  const who = firstName(n.actor?.full_name);
  switch (n.type) {
    case "seat_requested":
      return `${who} reserved a seat in your ride`;
    case "seat_confirmed":
      return "Your seat was confirmed";
    case "seat_declined":
      return "Your seat request was declined";
    case "seat_cancelled":
      return `${who} cancelled their seat`;
    case "ride_cancelled":
      return "Your ride was cancelled";
    case "request_accepted":
      return `${who} accepted your ride request`;
    case "new_message":
      return `One new message from ${who}`;
    default:
      return "New activity";
  }
}

export function MNotificationBell({
  notifications,
  unreadCount,
  initialError = null,
}: {
  notifications: NotificationWithContext[];
  unreadCount: number;
  initialError?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [markError, setMarkError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const hasUnread = unreadCount > 0;

  function open_() {
    setOpen(true);
    if (hasUnread) {
      startTransition(async () => {
        try {
          await markNotificationsRead();
          setMarkError(null);
          router.refresh();
        } catch {
          setMarkError("Could not mark notifications read.");
        }
      });
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Notifications"
        onClick={open_}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-tint text-brand-700 active:scale-95"
      >
        <Bell size={18} strokeWidth={2.2} />
        {hasUnread && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#C2410C] ring-2 ring-cream" />
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} labelledBy="notif-title">
        <div className="flex items-center justify-between pb-3">
          <p id="notif-title" className="text-[15px] font-extrabold text-ink">
            Notifications
          </p>
          {pending && <span className="text-xs text-muted-warm">Marking read…</span>}
        </div>
        {markError && (
          <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            {markError}
          </p>
        )}

        {notifications.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-warm">You&apos;re all caught up.</p>
        ) : (
          <ul className="divide-y divide-border-soft pb-4">
            {notifications.map((n) => (
              <NotifRow key={n.id} n={n} onNavigate={() => setOpen(false)} />
            ))}
          </ul>
        )}
      </BottomSheet>
    </>
  );
}

function NotifRow({
  n,
  onNavigate,
}: {
  n: NotificationWithContext;
  onNavigate: () => void;
}) {
  const Icon = ICON[n.type] ?? Bell;
  const unread = !n.read_at;
  const route = n.ride
    ? `${n.ride.origin_label} → ${n.ride.destination_label}`
    : n.request
      ? `${n.request.origin_label} → ${n.request.destination_label}`
      : null;
  const departs = n.ride
    ? format(new Date(n.ride.depart_at), "EEE, MMM d · h:mm a")
    : n.request
      ? format(new Date(n.request.depart_at), "EEE, MMM d")
      : null;
  const href = n.ride_id
    ? `/m/rides/${n.ride_id}`
    : n.request_id
      ? `/m/requests/${n.request_id}`
      : n.conversation_id
        ? `/m/messages/${n.conversation_id}`
        : null;

  const body = (
    <div className="flex gap-3 py-3.5">
      <div className="relative shrink-0">
        {n.actor ? (
          <MAvatar src={n.actor.avatar_url} name={n.actor.full_name} seed={n.actor.id} size={40} />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-tint text-brand-600">
            <Icon size={18} />
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-brand-600 shadow ring-1 ring-border">
          <Icon size={11} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">{titleFor(n)}</p>
        {route && (
          <p className="truncate text-xs text-muted">
            {route}
            {departs && <span className="text-muted-warm"> · {departs}</span>}
          </p>
        )}
        {n.type === "seat_cancelled" && n.message && (
          <p className="mt-1.5 rounded-[10px] bg-tint px-3 py-2 text-xs text-muted">
            “{n.message}”
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="whitespace-nowrap text-[11px] text-muted-warm">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </span>
        {unread && <span className="h-2 w-2 rounded-full bg-gold" />}
      </div>
    </div>
  );

  if (href) {
    return (
      <li>
        <Link href={href} prefetch onClick={onNavigate} className="block active:opacity-70">
          {body}
        </Link>
      </li>
    );
  }
  return <li>{body}</li>;
}

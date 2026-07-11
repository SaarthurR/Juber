"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Car, Check, X, Ban, Handshake, MessageCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { MAvatar } from "@/components/mobile/m-avatar";
import { markNotificationRead, markNotificationsRead } from "@/app/messages/actions";
import { createClient } from "@/lib/supabase/client";
import {
  failClosedNotificationState,
  loadVisibleNotificationIds,
} from "@/lib/messages";
import { mobileNotificationDestination } from "@/lib/route-targets";
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

const NOTIFICATION_SELECT =
  "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status), request:ride_requests!notifications_request_id_fkey(id,origin_label,destination_label,depart_at,status)";

const FALLBACK_NOTIFICATION_SELECT =
  "*, actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url), ride:rides!notifications_ride_id_fkey(id,origin_label,destination_label,depart_at,status)";

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
  userId,
  initialError = null,
}: {
  notifications: NotificationWithContext[];
  unreadCount: number;
  userId: string;
  initialError?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(notifications);
  const [unread, setUnread] = useState(unreadCount);
  const [markError, setMarkError] = useState<string | null>(initialError);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [markingAll, startMarkAllTransition] = useTransition();
  const [rowPending, setRowPending] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const initialKey = `${unreadCount}:${initialError ?? ""}:${notifications.map((n) => n.id).join(",")}`;
  const [syncedTo, setSyncedTo] = useState(initialKey);
  const hasUnread = unread > 0;

  const refreshNotifications = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const supabase = createClient();
    function failClosed(message: string) {
      const failed = failClosedNotificationState<NotificationWithContext>(message);
      setUnread(failed.unread);
      setItems(failed.items);
      setMarkError(failed.error);
    }
    try {
      const [unreadResult, notificationResult] = await Promise.all([
        loadVisibleNotificationIds(supabase, null, true),
        loadVisibleNotificationIds(supabase, 8, false),
      ]);
      if (generation !== refreshGeneration.current) return;
      if (unreadResult.error || notificationResult.error) {
        failClosed(unreadResult.error ?? notificationResult.error ?? "Could not refresh notifications.");
        return;
      }
      const notificationIds = notificationResult.ids;
      const notificationsResult = notificationIds.length
        ? await supabase
            .from("notifications")
            .select(NOTIFICATION_SELECT)
            .eq("recipient_id", userId)
            .in("id", notificationIds)
            .order("created_at", { ascending: false })
        : { data: [] as NotificationWithContext[], error: null };

      let data = notificationsResult.data;
      if (notificationsResult.error) {
        const fallback = await supabase
          .from("notifications")
          .select(FALLBACK_NOTIFICATION_SELECT)
          .eq("recipient_id", userId)
          .in("id", notificationIds)
          .order("created_at", { ascending: false })
          .limit(notificationIds.length);
        if (fallback.error) throw new Error("Could not load notifications.");
        data = fallback.data;
      }
      if (generation !== refreshGeneration.current) return;
      setUnread(unreadResult.ids.length);
      setItems(
        ((data ?? []) as NotificationWithContext[]).map((n) => ({
          ...n,
          request: n.request ?? null,
        })),
      );
      setMarkError(null);
    } catch {
      if (generation === refreshGeneration.current) {
        failClosed("Could not refresh notifications.");
      }
    }
  }, [userId]);

  if (syncedTo !== initialKey) {
    setSyncedTo(initialKey);
    setUnread(unreadCount);
    setItems(notifications);
    setMarkError(initialError);
    setStatusMessage(null);
    setRowError(null);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`mobile-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void refreshNotifications();
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void refreshNotifications();
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router, refreshNotifications]);

  function open_() {
    setOpen(true);
  }

  function markAllRead() {
    if (!hasUnread || markingAll) return;
    setStatusMessage(null);
    startMarkAllTransition(async () => {
      try {
        await markNotificationsRead();
        const readAt = new Date().toISOString();
        setUnread(0);
        setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? readAt })));
        setMarkError(null);
        setStatusMessage("All notifications marked read.");
        router.refresh();
      } catch {
        setMarkError("Could not mark notifications read.");
        setStatusMessage(null);
      }
    });
  }

  async function markOneAndNavigate(n: NotificationWithContext, href: string) {
    if (rowPending) return;
    setRowError(null);
    setStatusMessage(null);
    if (n.read_at) {
      setOpen(false);
      router.push(href);
      return;
    }
    setRowPending(n.id);
    try {
      await markNotificationRead(n.id);
      const readAt = new Date().toISOString();
      setUnread((count) => Math.max(0, count - 1));
      setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, read_at: readAt } : item)));
      setMarkError(null);
      setOpen(false);
      router.push(href);
      router.refresh();
    } catch {
      setRowError(n.id);
      setMarkError("Could not mark this notification read.");
    } finally {
      setRowPending(null);
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
          <button
            type="button"
            onClick={markAllRead}
            disabled={!hasUnread || markingAll}
            className="rounded-full px-2 py-1 text-xs font-bold text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markingAll ? "Marking…" : markError ? "Retry mark all read" : "Mark all read"}
          </button>
        </div>
        {statusMessage && (
          <p aria-live="polite" className="mb-2 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-700">
            {statusMessage}
          </p>
        )}
        {markError && (
          <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            {markError}
          </p>
        )}

        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-warm">You&apos;re all caught up.</p>
        ) : (
          <ul className="divide-y divide-border-soft pb-4">
            {items.map((n) => (
              <NotifRow
                key={n.id}
                n={n}
                pending={rowPending === n.id}
                failed={rowError === n.id}
                onNavigate={(href) => void markOneAndNavigate(n, href)}
              />
            ))}
          </ul>
        )}
      </BottomSheet>
    </>
  );
}

function NotifRow({
  n,
  pending,
  failed,
  onNavigate,
}: {
  n: NotificationWithContext;
  pending: boolean;
  failed: boolean;
  onNavigate: (href: string) => void;
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
  const href = mobileNotificationDestination(n);

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
        {(n.type === "ride_cancelled" || n.type === "seat_cancelled") && n.message && (
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
        <button
          type="button"
          onClick={() => onNavigate(href)}
          disabled={pending}
          aria-label={`${titleFor(n)}${unread ? ", unread" : ""}`}
          className="block w-full text-left active:opacity-70 disabled:cursor-wait disabled:opacity-70"
        >
          {body}
        </button>
        {failed && (
          <div className="mb-3 px-14">
            <button
              type="button"
              onClick={() => onNavigate(href)}
              className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
            >
              Retry
            </button>
          </div>
        )}
      </li>
    );
  }
  return <li>{body}</li>;
}

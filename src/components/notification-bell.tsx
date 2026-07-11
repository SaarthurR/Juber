"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Car, Check, X, Ban, Handshake, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/app/messages/actions";
import {
  failClosedNotificationState,
  loadVisibleNotificationIds,
} from "@/lib/messages";
import {
  createNotificationControllerState,
  isCurrentNotificationRefresh,
  notificationBulkControlStatus,
  notificationControllerKey,
  notificationControllerReducer,
  notificationWriteErrorMessage,
  notificationWritePending,
  subscribeToNotificationChanges,
  type NotificationSnapshot,
} from "@/lib/notifications-controller";
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
  initialError = null,
}: {
  initial: NotificationWithContext[];
  initialUnread: number;
  userId: string;
  initialError?: string | null;
}) {
  const initialSnapshot = {
    items: initial,
    unread: initialUnread,
    error: initialError,
  };

  return (
    <NotificationBellController
      key={notificationControllerKey(initialSnapshot)}
      userId={userId}
      initialSnapshot={initialSnapshot}
    />
  );
}

function NotificationBellController({
  userId,
  initialSnapshot,
}: {
  userId: string;
  initialSnapshot: NotificationSnapshot;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    notificationControllerReducer,
    initialSnapshot,
    createNotificationControllerState,
  );
  const ref = useRef<HTMLDivElement>(null);
  const refreshGeneration = useRef(0);
  const operationSequence = useRef(0);
  const active = useRef(true);

  const refreshNotifications = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const supabase = createClient();
    function failClosed(message: string) {
      const failed = failClosedNotificationState<NotificationWithContext>(message);
      if (
        isCurrentNotificationRefresh(
          generation,
          refreshGeneration.current,
          active.current,
        )
      ) {
        dispatch({ type: "reconcile-failed", error: failed.error });
      }
    }
    try {
      const [unreadResult, notificationResult] = await Promise.all([
        loadVisibleNotificationIds(supabase, null, true),
        loadVisibleNotificationIds(supabase, 6, false),
      ]);
      if (
        !isCurrentNotificationRefresh(
          generation,
          refreshGeneration.current,
          active.current,
        )
      ) {
        return;
      }
      if (unreadResult.error || notificationResult.error) {
        failClosed(
          unreadResult.error ?? notificationResult.error ?? "Could not refresh notifications.",
        );
        return;
      }
      const unreadIds = unreadResult.ids;
      const notificationIds = notificationResult.ids;
      const notificationsResult = notificationIds.length
        ? await supabase
            .from("notifications")
            .select(NOTIFICATION_SELECT)
            .eq("recipient_id", userId)
            .in("id", notificationIds)
            .order("created_at", { ascending: false })
        : { data: [] as NotificationWithContext[], error: null };
      if (
        !isCurrentNotificationRefresh(
          generation,
          refreshGeneration.current,
          active.current,
        )
      ) {
        return;
      }

      let data = notificationsResult.data;
      if (notificationsResult.error) {
        const fallback = await supabase
          .from("notifications")
          .select(FALLBACK_NOTIFICATION_SELECT)
          .eq("recipient_id", userId)
          .in("id", notificationIds)
          .order("created_at", { ascending: false });
        if (fallback.error) throw new Error("Could not load notifications.");
        data = fallback.data;
      }
      if (
        !isCurrentNotificationRefresh(
          generation,
          refreshGeneration.current,
          active.current,
        )
      ) {
        return;
      }
      dispatch({
        type: "reconcile",
        snapshot: {
          unread: unreadIds.length,
          items: ((data ?? []) as NotificationWithContext[]).map((n) => ({
            ...n,
            request: n.request ?? null,
          })),
          error: null,
        },
      });
    } catch {
      failClosed("Could not refresh notifications.");
    }
  }, [userId]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      refreshGeneration.current += 1;
    };
  }, []);

  // Live arrivals bump the dot + refresh the server data.
  useEffect(() => {
    const supabase = createClient();
    return subscribeToNotificationChanges(supabase, "bell", userId, () => {
      void refreshNotifications();
      router.refresh();
    });
  }, [userId, router, refreshNotifications]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void refreshNotifications();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshNotifications]);

  // Click-out + Esc close the popover.
  useEffect(() => {
    if (!state.open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        dispatch({ type: "close" });
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dispatch({ type: "close" });
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [state.open]);

  async function markAllRead() {
    if (state.unread === 0 || notificationWritePending(state)) return;
    const operationId = ++operationSequence.current;
    dispatch({ type: "mark-all-start", operationId });
    try {
      await markNotificationsRead();
      if (!active.current) return;
      dispatch({
        type: "mark-all-success",
        operationId,
        readAt: new Date().toISOString(),
      });
      router.refresh();
    } catch {
      if (!active.current) return;
      dispatch({
        type: "mark-all-failed",
        operationId,
        error: notificationWriteErrorMessage("bulk"),
      });
    }
  }

  async function markOneRead(id: string) {
    if (notificationWritePending(state)) return;
    const target = state.items.find((n) => n.id === id);
    if (!target || target.read_at) return;

    const operationId = ++operationSequence.current;
    dispatch({ type: "mark-one-start", id, operationId });
    const readAt = new Date().toISOString();
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", id)
      .eq("recipient_id", userId);
    if (!active.current) return;
    if (error) {
      dispatch({
        type: "mark-one-failed",
        id,
        operationId,
        error: notificationWriteErrorMessage("row"),
      });
      return;
    }
    dispatch({ type: "mark-one-success", id, operationId, readAt });
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          if (state.open) {
            dispatch({ type: "close" });
          } else {
            dispatch({ type: "open" });
            void refreshNotifications();
          }
        }}
        aria-label="Notifications"
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full bg-tint text-brand-600 hover:brightness-95 active:scale-95"
      >
        <Bell size={19} strokeWidth={2} />
        {state.unread > 0 && (
          <span className="absolute right-[7px] top-[6px] h-2 w-2 rounded-full bg-[#c2410c] ring-2 ring-white" />
        )}
      </button>

      {state.open && (
        <div className="motion-popover absolute right-0 top-[48px] z-50 w-[340px] overflow-hidden rounded-2xl border border-[#efe4d3] bg-white shadow-[0_24px_50px_-16px_rgba(92,59,46,0.3)]">
          <div className="flex items-center justify-between border-b border-[#f3ece1] px-[18px] py-4">
            <span className="text-base font-extrabold text-ink">Notifications</span>
            <button
              onClick={markAllRead}
              disabled={state.unread === 0 || notificationWritePending(state)}
              className="whitespace-nowrap text-[13px] font-bold text-brand-600 transition hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {notificationBulkControlStatus(state) === "pending"
                ? "Marking…"
                : state.bulkStatus === "error"
                  ? "Retry mark all read"
                  : "Mark all read"}
            </button>
          </div>

          {(state.loadError || state.bulkError || state.rowError) && (
            <p role="alert" className="border-b border-red-100 bg-red-50 px-[18px] py-2 text-xs text-red-700">
              {state.loadError ?? state.bulkError ?? state.rowError}
            </p>
          )}

          <div className="max-h-[360px] overflow-y-auto">
            {state.items.length === 0 ? (
              <p className="px-[18px] py-8 text-center text-sm text-stone-400">
                No notifications yet.
              </p>
            ) : (
              state.items.map((n) => {
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
                    prefetch
                    onClick={() => {
                      dispatch({ type: "close" });
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
            prefetch
            onClick={() => dispatch({ type: "close" })}
            className="block border-t border-[#f3ece1] px-[18px] py-3 text-center text-[13px] font-bold text-brand-600 transition hover:bg-[#fbf6ee]"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

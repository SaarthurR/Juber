"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, Car, Check, X, Ban, Handshake, MessageCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { MAvatar } from "@/components/mobile/m-avatar";
import {
  NotificationBulkReadControl,
  NotificationBulkReadFeedback,
  NotificationEvictedRowRetry,
  NotificationRowActions,
} from "@/components/notification-controls";
import { markNotificationRead, markNotificationsRead } from "@/app/messages/actions";
import { createClient } from "@/lib/supabase/client";
import {
  failClosedNotificationState,
  loadVisibleNotificationIds,
} from "@/lib/messages";
import {
  createNotificationControllerState,
  isCurrentNotificationRefresh,
  notificationBulkControlStatus,
  notificationCancellationReason,
  notificationControllerKey,
  notificationControllerReducer,
  notificationEvictedRowRetry,
  notificationRowPending,
  notificationTitle,
  notificationWriteErrorMessage,
  notificationWritePending,
  subscribeToNotificationChanges,
  type NotificationRowContext,
  type NotificationSnapshot,
} from "@/lib/notifications-controller";
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
  const initialSnapshot = {
    items: notifications,
    unread: unreadCount,
    error: initialError,
  };

  return (
    <MNotificationBellController
      key={notificationControllerKey(initialSnapshot)}
      userId={userId}
      initialSnapshot={initialSnapshot}
    />
  );
}

function MNotificationBellController({
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
        loadVisibleNotificationIds(supabase, 8, false),
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
          .order("created_at", { ascending: false })
          .limit(notificationIds.length);
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
          unread: unreadResult.ids.length,
          unreadIds: unreadResult.ids,
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

  useEffect(() => {
    const supabase = createClient();
    return subscribeToNotificationChanges(
      supabase,
      "mobile-notifications",
      userId,
      () => void refreshNotifications(),
    );
  }, [userId, refreshNotifications]);

  function open_() {
    dispatch({ type: "open" });
  }

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
    } catch {
      if (!active.current) return;
      dispatch({
        type: "mark-all-failed",
        operationId,
        error: notificationWriteErrorMessage("bulk"),
      });
    }
  }

  async function markOneAndNavigate(
    context: NotificationRowContext,
    alreadyRead: boolean,
    retainFallback = false,
  ) {
    if (notificationWritePending(state)) return;
    if (alreadyRead) {
      dispatch({ type: "close" });
      router.push(context.destination);
      return;
    }
    const operationId = ++operationSequence.current;
    dispatch({
      type: "mark-one-start",
      id: context.id,
      operationId,
      context,
      retainFallback,
    });
    try {
      await markNotificationRead(context.id);
      if (!active.current) return;
      dispatch({
        type: "mark-one-success",
        id: context.id,
        operationId,
        readAt: new Date().toISOString(),
      });
      dispatch({ type: "close" });
      router.push(context.destination);
      router.refresh();
    } catch {
      if (!active.current) return;
      dispatch({
        type: "mark-one-failed",
        id: context.id,
        operationId,
        error: notificationWriteErrorMessage("row"),
      });
    }
  }

  const evictedRetry = notificationEvictedRowRetry(state);

  return (
    <>
      <button
        type="button"
        aria-label="Notifications"
        onClick={open_}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-tint text-brand-700 active:scale-95"
      >
        <Bell size={18} strokeWidth={2.2} />
        {state.unread > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#C2410C] ring-2 ring-cream" />
        )}
      </button>

      <BottomSheet
        open={state.open}
        onClose={() => dispatch({ type: "close" })}
        labelledBy="notif-title"
        dismissDisabled={notificationWritePending(state)}
        closeLabel="Close notifications"
      >
        <div className="flex items-center justify-between pb-3">
          <p id="notif-title" className="text-[15px] font-extrabold text-ink">
            Notifications
          </p>
          <NotificationBulkReadControl
            unread={state.unread}
            status={notificationBulkControlStatus(state)}
            disabled={notificationWritePending(state)}
            onActivate={() => void markAllRead()}
          />
        </div>
        <NotificationBulkReadFeedback
          error={state.bulkError}
          statusMessage={state.bulkStatusMessage}
        />
        {state.loadError ? (
          <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            {state.loadError}
          </p>
        ) : null}
        {evictedRetry ? (
          <NotificationEvictedRowRetry
            title={evictedRetry.context.title}
            error={evictedRetry.error}
            pending={evictedRetry.pending}
            onRetry={() =>
              void markOneAndNavigate(evictedRetry.context, false, true)
            }
          />
        ) : null}

        {state.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-warm">You&apos;re all caught up.</p>
        ) : (
          <ul className="divide-y divide-border-soft pb-4">
            {state.items.map((n) => (
              <NotifRow
                key={n.id}
                n={n}
                pending={notificationRowPending(state, n.id)}
                disabled={notificationWritePending(state)}
                error={
                  evictedRetry?.context.id === n.id
                    ? null
                    : state.rowErrorId === n.id
                      ? state.rowError
                      : null
                }
                onNavigate={(href) =>
                  void markOneAndNavigate(
                    {
                      id: n.id,
                      title: notificationTitle(n),
                      destination: href,
                    },
                    n.read_at !== null,
                  )
                }
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
  disabled,
  error,
  onNavigate,
}: {
  n: NotificationWithContext;
  pending: boolean;
  disabled: boolean;
  error: string | null;
  onNavigate: (href: string) => void;
}) {
  const Icon = ICON[n.type] ?? Bell;
  const unread = !n.read_at;
  const title = notificationTitle(n);
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
  const cancellationReason = notificationCancellationReason(n);

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
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        {route && (
          <p className="truncate text-xs text-muted">
            {route}
            {departs && <span className="text-muted-warm"> · {departs}</span>}
          </p>
        )}
        {cancellationReason ? (
          <p className="mt-1.5 rounded-[10px] bg-tint px-3 py-2 text-xs text-muted">
            “{cancellationReason}”
          </p>
        ) : null}
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
        <NotificationRowActions
          title={title}
          unread={unread}
          pending={pending}
          disabled={disabled}
          error={error}
          onActivate={() => onNavigate(href)}
          onRetry={() => onNavigate(href)}
        >
          {body}
        </NotificationRowActions>
      </li>
    );
  }
  return <li>{body}</li>;
}

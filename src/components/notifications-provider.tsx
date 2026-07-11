"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/app/messages/actions";
import {
  failClosedNotificationState,
  loadVisibleNotificationIds,
} from "@/lib/messages";
import {
  createNotificationControllerState,
  isCurrentNotificationRefresh,
  notificationControllerReducer,
  notificationTitle,
  notificationWriteErrorMessage,
  type NotificationControllerAction,
  type NotificationControllerState,
  type NotificationSnapshot,
  subscribeToNotificationChanges,
} from "@/lib/notifications-controller";
import {
  FALLBACK_NOTIFICATION_SELECT,
  NOTIFICATION_SELECT,
} from "@/lib/notifications-query";
import type { NotificationWithContext } from "@/lib/types";

type NotificationsContextValue = {
  state: NotificationControllerState;
  dispatch: React.Dispatch<NotificationControllerAction>;
  refreshNotifications: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markOneRead: (id: string, destination: string) => Promise<void>;
};

const emptySnapshot: NotificationSnapshot = {
  items: [],
  unread: 0,
  unreadIds: [],
  error: null,
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({
  userId,
  initial,
  children,
}: {
  userId: string | null;
  initial: NotificationSnapshot | null;
  children: React.ReactNode;
}) {
  const initialSnapshot = initial ?? emptySnapshot;
  const [state, dispatch] = useReducer(
    notificationControllerReducer,
    initialSnapshot,
    createNotificationControllerState,
  );
  const refreshGeneration = useRef(0);
  const operationSequence = useRef(0);
  const active = useRef(true);

  useEffect(() => {
    dispatch({ type: "reconcile", snapshot: initialSnapshot });
  }, [initialSnapshot]);

  const refreshNotifications = useCallback(async () => {
    if (!userId) return;
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
          unreadIds,
          items: ((data ?? []) as NotificationWithContext[]).map((notification) => ({
            ...notification,
            request: notification.request ?? null,
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
    if (!userId) return undefined;
    const supabase = createClient();
    return subscribeToNotificationChanges(supabase, "bell", userId, () => {
      void refreshNotifications();
    });
  }, [userId, refreshNotifications]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void refreshNotifications();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshNotifications]);

  const markAllRead = useCallback(async () => {
    if (state.unread === 0 || state.operation) return;
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
  }, [state.operation, state.unread]);

  const markOneRead = useCallback(async (id: string, destination: string) => {
    if (!userId || state.operation) return;
    const target = state.items.find((notification) => notification.id === id);
    if (!target || target.read_at) return;

    const operationId = ++operationSequence.current;
    dispatch({
      type: "mark-one-start",
      id,
      operationId,
      context: {
        id,
        title: notificationTitle(target),
        destination,
      },
    });
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
  }, [state.items, state.operation, userId]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      refreshNotifications,
      markAllRead,
      markOneRead,
    }),
    [markAllRead, markOneRead, refreshNotifications, state],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return value;
}

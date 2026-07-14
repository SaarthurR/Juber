"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markNotificationRead, markNotificationsRead } from "@/app/messages/actions";
import { useDemoRuntime } from "@/components/demo-runtime-provider";
import {
  failClosedNotificationState,
  loadVisibleNotificationIds,
} from "@/lib/messages";
import {
  createNotificationRefreshGate,
  createNotificationControllerState,
  createSurfaceRefreshDebouncer,
  notificationControllerReducer,
  notificationTitle,
  notificationTriggersSurfaceRefresh,
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
  const router = useRouter();
  const { enabled: demoEnabled } = useDemoRuntime();
  const [state, dispatch] = useReducer(
    notificationControllerReducer,
    initialSnapshot,
    createNotificationControllerState,
  );
  const identity = useMemo(
    () => ({ userId, snapshot: initialSnapshot }),
    [initialSnapshot, userId],
  );
  const [refreshGate] = useState(
    () => createNotificationRefreshGate<typeof identity>(),
  );
  const operationSequence = useRef(0);
  const currentIdentity = useRef({ userId, identity });
  const refreshNotificationsRef = useRef<() => Promise<void>>(async () => undefined);
  const surfaceRefreshRef = useRef(createSurfaceRefreshDebouncer(() => router.refresh()));

  useLayoutEffect(() => {
    currentIdentity.current = { userId, identity };
    refreshGate.begin(identity);
    operationSequence.current = 0;
    dispatch({ type: "reset", snapshot: initialSnapshot });
    return () => {
      refreshGate.invalidate(identity);
    };
  }, [identity, initialSnapshot, refreshGate, userId]);

  const refreshNotifications = useCallback(async () => {
    if (!userId) return;
    if (demoEnabled) {
      router.refresh();
      return;
    }
    const ticket = refreshGate.start(identity);
    if (!ticket) return;
    const currentTicket = ticket;
    const supabase = createClient();
    function failClosed(message: string) {
      const failed = failClosedNotificationState<NotificationWithContext>(message);
      if (refreshGate.isCurrent(currentTicket)) {
        dispatch({ type: "reconcile-failed", error: failed.error });
      }
    }
    try {
      const [unreadResult, notificationResult] = await Promise.all([
        loadVisibleNotificationIds(supabase, null, true),
        loadVisibleNotificationIds(supabase, 6, false),
      ]);
      if (!refreshGate.isCurrent(currentTicket)) return;
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
      if (!refreshGate.isCurrent(currentTicket)) return;

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
      if (!refreshGate.isCurrent(currentTicket)) return;
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
  }, [demoEnabled, identity, refreshGate, router, userId]);

  useLayoutEffect(() => {
    refreshNotificationsRef.current = refreshNotifications;
  }, [refreshNotifications]);

  useEffect(() => {
    surfaceRefreshRef.current.cancel();
    surfaceRefreshRef.current = createSurfaceRefreshDebouncer(() => router.refresh());
    return () => {
      surfaceRefreshRef.current.cancel();
    };
  }, [router, userId]);

  useEffect(() => {
    if (!userId) return undefined;
    if (demoEnabled) return undefined;
    const channelUserId = userId;
    const supabase = createClient();
    return subscribeToNotificationChanges(supabase, "bell", userId, ({ type }) => {
      const current = currentIdentity.current;
      if (
        current.userId !== channelUserId
        || !refreshGate.isActive(current.identity)
      ) {
        return;
      }
      void refreshNotificationsRef.current().then(() => {
        if (
          current.userId !== channelUserId
          || !refreshGate.isActive(current.identity)
        ) {
          return;
        }
        if (notificationTriggersSurfaceRefresh(type)) {
          surfaceRefreshRef.current.schedule();
        }
      });
    });
  }, [demoEnabled, refreshGate, userId]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void refreshNotificationsRef.current();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const markAllRead = useCallback(async () => {
    if (
      !refreshGate.isActive(identity)
      || state.unread === 0
      || state.operation
    ) {
      return;
    }
    const operationId = ++operationSequence.current;
    dispatch({ type: "mark-all-start", operationId });
    try {
      await markNotificationsRead();
      if (!refreshGate.isActive(identity)) return;
      dispatch({
        type: "mark-all-success",
        operationId,
        readAt: new Date().toISOString(),
      });
    } catch {
      if (!refreshGate.isActive(identity)) return;
      dispatch({
        type: "mark-all-failed",
        operationId,
        error: notificationWriteErrorMessage("bulk"),
      });
    }
  }, [identity, refreshGate, state.operation, state.unread]);

  const markOneRead = useCallback(async (id: string, destination: string) => {
    if (!userId || !refreshGate.isActive(identity) || state.operation) return;
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
    if (demoEnabled) {
      try {
        await markNotificationRead(id);
      } catch {
        dispatch({
          type: "mark-one-failed",
          id,
          operationId,
          error: notificationWriteErrorMessage("row"),
        });
        return;
      }
      if (refreshGate.isActive(identity)) {
        dispatch({ type: "mark-one-success", id, operationId, readAt });
      }
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", id)
      .eq("recipient_id", userId);
    if (!refreshGate.isActive(identity)) return;
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
  }, [demoEnabled, identity, refreshGate, state.items, state.operation, userId]);

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

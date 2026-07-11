import type { NotificationWithContext } from "@/lib/types";

export type NotificationSnapshot = {
  items: NotificationWithContext[];
  unread: number;
  error: string | null;
};

export type NotificationBulkStatus = "idle" | "pending" | "success" | "error";

export type NotificationControllerState = {
  items: NotificationWithContext[];
  unread: number;
  open: boolean;
  loadError: string | null;
  bulkStatus: NotificationBulkStatus;
  bulkError: string | null;
  bulkStatusMessage: string | null;
  rowPendingId: string | null;
  rowErrorId: string | null;
  rowError: string | null;
};

export type NotificationControllerAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "reconcile"; snapshot: NotificationSnapshot }
  | { type: "reconcile-failed"; error: string }
  | { type: "mark-one-start"; id: string }
  | { type: "mark-one-success"; id: string; readAt: string }
  | { type: "mark-one-failed"; id: string; error: string }
  | { type: "mark-all-start" }
  | { type: "mark-all-success"; readAt: string }
  | { type: "mark-all-failed"; error: string };

export function createNotificationControllerState(
  snapshot: NotificationSnapshot,
): NotificationControllerState {
  return {
    items: snapshot.error ? [] : snapshot.items,
    unread: snapshot.error ? 0 : snapshot.unread,
    open: false,
    loadError: snapshot.error,
    bulkStatus: "idle",
    bulkError: null,
    bulkStatusMessage: null,
    rowPendingId: null,
    rowErrorId: null,
    rowError: null,
  };
}

export function notificationControllerReducer(
  state: NotificationControllerState,
  action: NotificationControllerAction,
): NotificationControllerState {
  switch (action.type) {
    case "open":
      return { ...state, open: true };
    case "close":
      return { ...state, open: false };
    case "reconcile": {
      if (action.snapshot.error) {
        return failClosedState(state, action.snapshot.error);
      }
      const failedRowStillUnread = action.snapshot.items.some(
        (item) => item.id === state.rowErrorId && item.read_at === null,
      );
      return {
        ...state,
        items: action.snapshot.items,
        unread: action.snapshot.unread,
        loadError: null,
        rowErrorId: failedRowStillUnread ? state.rowErrorId : null,
        rowError: failedRowStillUnread ? state.rowError : null,
      };
    }
    case "reconcile-failed":
      return failClosedState(state, action.error);
    case "mark-one-start":
      return {
        ...state,
        rowPendingId: action.id,
        rowErrorId: null,
        rowError: null,
      };
    case "mark-one-success": {
      const target = state.items.find((item) => item.id === action.id);
      const decrementsUnread = target?.read_at === null;
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, read_at: action.readAt } : item,
        ),
        unread: decrementsUnread ? Math.max(0, state.unread - 1) : state.unread,
        rowPendingId: null,
        rowErrorId: null,
        rowError: null,
      };
    }
    case "mark-one-failed":
      return {
        ...state,
        rowPendingId: null,
        rowErrorId: action.id,
        rowError: action.error,
      };
    case "mark-all-start":
      return {
        ...state,
        bulkStatus: "pending",
        bulkError: null,
        bulkStatusMessage: null,
      };
    case "mark-all-success":
      return {
        ...state,
        items: state.items.map((item) => ({
          ...item,
          read_at: item.read_at ?? action.readAt,
        })),
        unread: 0,
        bulkStatus: "success",
        bulkError: null,
        bulkStatusMessage: "All notifications marked read.",
        rowPendingId: null,
        rowErrorId: null,
        rowError: null,
      };
    case "mark-all-failed":
      return {
        ...state,
        bulkStatus: "error",
        bulkError: action.error,
        bulkStatusMessage: null,
      };
  }
}

function failClosedState(
  state: NotificationControllerState,
  error: string,
): NotificationControllerState {
  return {
    ...state,
    items: [],
    unread: 0,
    loadError: error,
    rowPendingId: null,
    rowErrorId: null,
    rowError: null,
  };
}

export function notificationControllerKey(snapshot: NotificationSnapshot): string {
  return JSON.stringify(snapshot);
}

export function notificationTitle(notification: NotificationWithContext): string {
  const who = notification.actor?.full_name?.split(" ")[0] ?? "Someone";
  switch (notification.type) {
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
  }
}

export function notificationCancellationReason(
  notification: NotificationWithContext,
): string | null {
  return notification.type === "ride_cancelled" || notification.type === "seat_cancelled"
    ? notification.message
    : null;
}

export type NotificationRealtimeEvent = "INSERT" | "UPDATE";
export type NotificationRealtimeOwner = "mobile-notifications" | "bell";

type NotificationRealtimeFilter = {
  event: NotificationRealtimeEvent;
  schema: "public";
  table: "notifications";
  filter: string;
};

type NotificationRealtimeChannel<TChannel> = {
  on(
    kind: "postgres_changes",
    filter: NotificationRealtimeFilter,
    callback: () => void,
  ): TChannel;
  subscribe(): TChannel;
};

type NotificationRealtimeClient<TChannel> = {
  channel(name: string): TChannel;
  removeChannel(channel: TChannel): unknown;
};

const NOTIFICATION_REALTIME_EVENTS: readonly NotificationRealtimeEvent[] = [
  "INSERT",
  "UPDATE",
];

export function subscribeToNotificationChanges<
  TChannel extends NotificationRealtimeChannel<TChannel>,
>(
  client: NotificationRealtimeClient<TChannel>,
  owner: NotificationRealtimeOwner,
  userId: string,
  onChange: (event: NotificationRealtimeEvent) => void,
): () => void {
  let channel = client.channel(`${owner}:${userId}`);
  for (const event of NOTIFICATION_REALTIME_EVENTS) {
    channel = channel.on(
      "postgres_changes",
      {
        event,
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      () => onChange(event),
    );
  }
  const subscribed = channel.subscribe();
  return () => {
    void client.removeChannel(subscribed);
  };
}

export function isCurrentNotificationRefresh(
  startedGeneration: number,
  currentGeneration: number,
  active: boolean,
): boolean {
  return active && startedGeneration === currentGeneration;
}

export function shouldStartNotificationMarkRead(
  hasUnread: boolean,
  attempted: boolean,
): boolean {
  return hasUnread && !attempted;
}

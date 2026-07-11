import type { NotificationWithContext } from "@/lib/types";

export type NotificationSnapshot = {
  items: NotificationWithContext[];
  unread: number;
  unreadIds?: readonly string[] | null;
  error: string | null;
};

export type NotificationBulkStatus = "idle" | "pending" | "success" | "error";

export type NotificationRowContext = {
  id: string;
  title: string;
  destination: string;
};

export type NotificationWriteOperation =
  | {
      kind: "row";
      id: string;
      context: NotificationRowContext;
      operationId: number;
      startedRevision: number;
    }
  | {
      kind: "bulk";
      operationId: number;
      startedRevision: number;
    };

export type NotificationControllerState = {
  items: NotificationWithContext[];
  unread: number;
  open: boolean;
  loadError: string | null;
  authoritativeRevision: number;
  operation: NotificationWriteOperation | null;
  bulkStatus: Exclude<NotificationBulkStatus, "pending">;
  bulkError: string | null;
  bulkStatusMessage: string | null;
  rowErrorId: string | null;
  rowError: string | null;
  rowErrorContext: NotificationRowContext | null;
};

export type NotificationControllerAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "reconcile"; snapshot: NotificationSnapshot }
  | { type: "reconcile-failed"; error: string }
  | {
      type: "mark-one-start";
      id: string;
      operationId: number;
      context: NotificationRowContext;
    }
  | { type: "mark-one-success"; id: string; operationId: number; readAt: string }
  | { type: "mark-one-failed"; id: string; operationId: number; error: string }
  | { type: "mark-all-start"; operationId: number }
  | { type: "mark-all-success"; operationId: number; readAt: string }
  | { type: "mark-all-failed"; operationId: number; error: string };

export function createNotificationControllerState(
  snapshot: NotificationSnapshot,
): NotificationControllerState {
  return {
    items: snapshot.error ? [] : snapshot.items,
    unread: snapshot.error ? 0 : snapshot.unread,
    open: false,
    loadError: snapshot.error,
    authoritativeRevision: 0,
    operation: null,
    bulkStatus: "idle",
    bulkError: null,
    bulkStatusMessage: null,
    rowErrorId: null,
    rowError: null,
    rowErrorContext: null,
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
      const rowError = reconcileRowError(state, action.snapshot);
      return {
        ...state,
        items: action.snapshot.items,
        unread: action.snapshot.unread,
        loadError: null,
        authoritativeRevision: state.authoritativeRevision + 1,
        operation: reconcileOperation(state.operation, action.snapshot),
        bulkStatus: "idle",
        bulkError: null,
        bulkStatusMessage: null,
        rowErrorId: rowError?.context.id ?? null,
        rowError: rowError?.error ?? null,
        rowErrorContext: rowError?.context ?? null,
      };
    }
    case "reconcile-failed":
      return failClosedState(state, action.error);
    case "mark-one-start":
      if (state.operation) return state;
      return {
        ...state,
        operation: {
          kind: "row",
          id: action.id,
          context: action.context,
          operationId: action.operationId,
          startedRevision: state.authoritativeRevision,
        },
        bulkStatus: "idle",
        bulkError: null,
        bulkStatusMessage: null,
        rowErrorId: null,
        rowError: null,
        rowErrorContext: null,
      };
    case "mark-one-success": {
      if (!matchesRowOperation(state.operation, action.id, action.operationId)) {
        return state;
      }
      if (state.operation.startedRevision !== state.authoritativeRevision) {
        return { ...state, operation: null };
      }
      const target = state.items.find((item) => item.id === action.id);
      const decrementsUnread = target?.read_at === null;
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, read_at: action.readAt } : item,
        ),
        unread: decrementsUnread ? Math.max(0, state.unread - 1) : state.unread,
        operation: null,
        rowErrorId: null,
        rowError: null,
        rowErrorContext: null,
      };
    }
    case "mark-one-failed":
      if (!matchesRowOperation(state.operation, action.id, action.operationId)) {
        return state;
      }
      return {
        ...state,
        operation: null,
        rowErrorId: action.id,
        rowError: action.error,
        rowErrorContext: state.operation.context,
      };
    case "mark-all-start":
      if (state.operation) return state;
      return {
        ...state,
        operation: {
          kind: "bulk",
          operationId: action.operationId,
          startedRevision: state.authoritativeRevision,
        },
        bulkStatus: "idle",
        bulkError: null,
        bulkStatusMessage: null,
        rowErrorId: null,
        rowError: null,
        rowErrorContext: null,
      };
    case "mark-all-success":
      if (!matchesBulkOperation(state.operation, action.operationId)) {
        return state;
      }
      if (state.operation.startedRevision !== state.authoritativeRevision) {
        return { ...state, operation: null };
      }
      return {
        ...state,
        items: state.items.map((item) => ({
          ...item,
          read_at: item.read_at ?? action.readAt,
        })),
        unread: 0,
        operation: null,
        bulkStatus: "success",
        bulkError: null,
        bulkStatusMessage: "All notifications marked read.",
        rowErrorId: null,
        rowError: null,
        rowErrorContext: null,
      };
    case "mark-all-failed":
      if (!matchesBulkOperation(state.operation, action.operationId)) {
        return state;
      }
      return {
        ...state,
        operation: null,
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
  };
}

function reconcileRowError(
  state: NotificationControllerState,
  snapshot: NotificationSnapshot,
): { context: NotificationRowContext; error: string } | null {
  const context = state.rowErrorContext;
  const error = state.rowError;
  if (!context || !error) return null;
  return notificationIsStillUnread(context.id, snapshot)
    ? { context, error }
    : null;
}

function reconcileOperation(
  operation: NotificationWriteOperation | null,
  snapshot: NotificationSnapshot,
): NotificationWriteOperation | null {
  if (!operation) return null;
  if (operation.kind === "bulk") return snapshot.unread === 0 ? null : operation;
  return notificationIsStillUnread(operation.id, snapshot) ? operation : null;
}

function notificationIsStillUnread(
  id: string,
  snapshot: NotificationSnapshot,
): boolean {
  const row = snapshot.items.find((item) => item.id === id);
  if (row) return row.read_at === null;
  const completeUnreadIds = snapshot.unreadIds;
  return completeUnreadIds ? completeUnreadIds.includes(id) : true;
}

function matchesRowOperation(
  operation: NotificationWriteOperation | null,
  id: string,
  operationId: number,
): operation is Extract<NotificationWriteOperation, { kind: "row" }> {
  return (
    operation?.kind === "row" &&
    operation.id === id &&
    operation.operationId === operationId
  );
}

function matchesBulkOperation(
  operation: NotificationWriteOperation | null,
  operationId: number,
): operation is Extract<NotificationWriteOperation, { kind: "bulk" }> {
  return operation?.kind === "bulk" && operation.operationId === operationId;
}

export function notificationBulkControlStatus(
  state: NotificationControllerState,
): NotificationBulkStatus {
  return state.operation?.kind === "bulk" ? "pending" : state.bulkStatus;
}

export function notificationWritePending(state: NotificationControllerState): boolean {
  return state.operation !== null;
}

export function notificationRowPending(
  state: NotificationControllerState,
  id: string,
): boolean {
  return state.operation?.kind === "row" && state.operation.id === id;
}

export function notificationEvictedRowRetry(
  state: NotificationControllerState,
): { context: NotificationRowContext; error: string } | null {
  const context = state.rowErrorContext;
  const error = state.rowError;
  if (!context || !error) return null;
  return state.items.some((item) => item.id === context.id)
    ? null
    : { context, error };
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

export const NOTIFICATION_AUTH_ERROR =
  "Your session expired. Sign in again, then retry.";

export function requireNotificationWriteAuthentication<T extends { id: string }>(
  user: T | null | undefined,
): T {
  if (!user) throw new Error(NOTIFICATION_AUTH_ERROR);
  return user;
}

export function notificationWriteErrorMessage(kind: "row" | "bulk"): string {
  return kind === "row"
    ? "Could not mark this notification read. If your session expired, sign in again and retry."
    : "Could not mark notifications read. If your session expired, sign in again and retry.";
}

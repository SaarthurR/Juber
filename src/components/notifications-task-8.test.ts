import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NotificationWithContext } from "../lib/types";

async function loadController() {
  return import("../lib/notifications-controller").catch(() => null);
}

async function loadControls() {
  return import("./notification-controls").catch(() => null);
}

function notification(
  id: string,
  overrides: Partial<NotificationWithContext> = {},
): NotificationWithContext {
  return {
    id,
    recipient_id: "user-1",
    actor_id: "user-2",
    type: "seat_confirmed",
    ride_id: "ride-1",
    request_id: null,
    conversation_id: null,
    message: null,
    read_at: null,
    created_at: "2026-07-11T12:00:00.000Z",
    actor: {
      id: "user-2",
      full_name: "Ari Shah",
      avatar_url: null,
    },
    ride: {
      id: "ride-1",
      origin_label: "Fremont",
      destination_label: "JCNC",
      depart_at: "2026-07-12T12:00:00.000Z",
      status: "active",
    },
    request: null,
    ...overrides,
  };
}

function rowContext(id: string) {
  return {
    id,
    title: "Your seat was confirmed",
    destination: `/m/rides/${id}`,
  };
}

test("controller initializes from the authoritative server snapshot", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const items = [notification("one"), notification("two")];
  const state = controller.createNotificationControllerState({
    items,
    unread: 2,
    error: null,
  });

  assert.deepEqual(state.items, items);
  assert.equal(state.unread, 2);
  assert.equal(state.open, false);
  assert.equal(state.loadError, null);
  assert.equal(state.bulkStatus, "idle");
  assert.equal(state.rowErrorId, null);
});

test("opening the mobile sheet leaves read state and counts unchanged", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one")],
    unread: 1,
    error: null,
  });
  const opened = controller.notificationControllerReducer(initial, { type: "open" });

  assert.equal(opened.open, true);
  assert.equal(opened.unread, 1);
  assert.equal(opened.items[0].read_at, null);
  assert.equal(opened.bulkStatus, "idle");
});

test("INSERT and UPDATE reconcile to bounded authoritative items and count", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one")],
    unread: 1,
    error: null,
  });
  const afterInsert = controller.notificationControllerReducer(initial, {
    type: "reconcile",
    snapshot: {
      items: [notification("two"), notification("one")],
      unread: 2,
      error: null,
    },
  });
  const afterUpdate = controller.notificationControllerReducer(afterInsert, {
    type: "reconcile",
    snapshot: {
      items: [
        notification("two", { read_at: "2026-07-11T12:01:00.000Z" }),
        notification("one"),
      ],
      unread: 1,
      error: null,
    },
  });

  assert.deepEqual(afterInsert.items.map((item) => item.id), ["two", "one"]);
  assert.equal(afterInsert.unread, 2);
  assert.equal(afterUpdate.unread, 1);
  assert.equal(afterUpdate.items[0].read_at, "2026-07-11T12:01:00.000Z");
});

test("mark-one success updates only that row and decrements once", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one"), notification("two")],
    unread: 2,
    error: null,
  });
  const pending = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: "one",
    operationId: 1,
    context: rowContext("one"),
  });
  const succeeded = controller.notificationControllerReducer(pending, {
    type: "mark-one-success",
    id: "one",
    operationId: 1,
    readAt: "2026-07-11T12:02:00.000Z",
  });

  assert.equal(pending.operation?.kind, "row");
  assert.equal(succeeded.unread, 1);
  assert.equal(succeeded.items[0].read_at, "2026-07-11T12:02:00.000Z");
  assert.equal(succeeded.items[1].read_at, null);
  assert.equal(succeeded.operation, null);
});

test("mark-one failure preserves count and retries independently from bulk read", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one")],
    unread: 1,
    error: null,
  });
  const failed = controller.notificationControllerReducer(
    controller.notificationControllerReducer(initial, {
      type: "mark-one-start",
      id: "one",
      operationId: 2,
      context: rowContext("one"),
    }),
    {
      type: "mark-one-failed",
      id: "one",
      operationId: 2,
      error: "Could not mark this notification read.",
    },
  );
  const retrying = controller.notificationControllerReducer(failed, {
    type: "mark-one-start",
    id: "one",
    operationId: 3,
    context: rowContext("one"),
  });
  const retried = controller.notificationControllerReducer(retrying, {
    type: "mark-one-success",
    id: "one",
    operationId: 3,
    readAt: "2026-07-11T12:03:00.000Z",
  });

  assert.equal(failed.unread, 1);
  assert.equal(failed.items[0].read_at, null);
  assert.equal(failed.rowErrorId, "one");
  assert.equal(failed.bulkStatus, "idle");
  assert.equal(retrying.rowErrorId, null);
  assert.equal(retried.unread, 0);
});

test("mark-all failure preserves rows and retry succeeds without row-error coupling", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one"), notification("two")],
    unread: 2,
    error: null,
  });
  const failed = controller.notificationControllerReducer(
    controller.notificationControllerReducer(initial, {
      type: "mark-all-start",
      operationId: 4,
    }),
    {
      type: "mark-all-failed",
      operationId: 4,
      error: "Could not mark notifications read.",
    },
  );
  const retrying = controller.notificationControllerReducer(failed, {
    type: "mark-all-start",
    operationId: 5,
  });
  const retried = controller.notificationControllerReducer(retrying, {
    type: "mark-all-success",
    operationId: 5,
    readAt: "2026-07-11T12:04:00.000Z",
  });

  assert.equal(failed.unread, 2);
  assert.equal(failed.items.every((item) => item.read_at === null), true);
  assert.equal(failed.bulkStatus, "error");
  assert.equal(failed.rowErrorId, null);
  assert.equal(controller.notificationBulkControlStatus(retrying), "pending");
  assert.equal(retried.unread, 0);
  assert.equal(retried.items.every((item) => item.read_at !== null), true);
  assert.equal(retried.bulkStatus, "success");
});

test("changed server props produce a new remount key and fresh initial state", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const first = {
    items: [notification("one")],
    unread: 1,
    error: null,
  };
  const next = {
    items: [notification("two", { read_at: "2026-07-11T12:05:00.000Z" })],
    unread: 0,
    error: null,
  };

  assert.notEqual(
    controller.notificationControllerKey(first),
    controller.notificationControllerKey(next),
  );
  const resynced = controller.createNotificationControllerState(next);
  assert.deepEqual(resynced.items, next.items);
  assert.equal(resynced.unread, 0);
  assert.equal(resynced.open, false);
});

test("visibility failure fails closed and removes stale click targets", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one")],
    unread: 1,
    error: null,
  });
  const failed = controller.notificationControllerReducer(initial, {
    type: "reconcile-failed",
    error: "Could not refresh notifications.",
  });

  assert.deepEqual(failed.items, []);
  assert.equal(failed.unread, 0);
  assert.equal(failed.loadError, "Could not refresh notifications.");
});

test("one realtime channel owns INSERT and UPDATE and cleans up once", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const handlers = new Map<string, () => void>();
  let channelCount = 0;
  let subscribeCount = 0;
  let cleanupCount = 0;
  const channel = {
    on(
      _kind: "postgres_changes",
      filter: { event: string },
      handler: () => void,
    ) {
      handlers.set(filter.event, handler);
      return channel;
    },
    subscribe() {
      subscribeCount += 1;
      return channel;
    },
  };
  const client = {
    channel(name: string) {
      channelCount += 1;
      assert.equal(name, "mobile-notifications:user-1");
      return channel;
    },
    removeChannel(received: typeof channel) {
      assert.equal(received, channel);
      cleanupCount += 1;
    },
  };
  const events: string[] = [];

  const cleanup = controller.subscribeToNotificationChanges(
    client,
    "mobile-notifications",
    "user-1",
    (event: string) => events.push(event),
  );
  handlers.get("INSERT")?.();
  handlers.get("UPDATE")?.();
  cleanup();

  assert.equal(channelCount, 1);
  assert.equal(subscribeCount, 1);
  assert.deepEqual(events, ["INSERT", "UPDATE"]);
  assert.equal(cleanupCount, 1);
});

test("refresh generation rejects older or cancelled authoritative responses", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  assert.equal(controller.isCurrentNotificationRefresh(2, 2, true), true);
  assert.equal(controller.isCurrentNotificationRefresh(1, 2, true), false);
  assert.equal(controller.isCurrentNotificationRefresh(2, 2, false), false);
});

test("desktop full-list read owner starts once and can retry after failure", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  assert.equal(controller.shouldStartNotificationMarkRead(true, false), true);
  assert.equal(controller.shouldStartNotificationMarkRead(true, true), false);
  assert.equal(controller.shouldStartNotificationMarkRead(false, false), false);
  assert.equal(controller.shouldStartNotificationMarkRead(true, false), true);
});

test("rendered row and bulk controls have separate errors and specific accessible names", async () => {
  const controls = await loadControls();
  assert.ok(controls, "notification controls must exist");
  if (!controls) return;

  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(controls.NotificationBulkReadControl, {
        unread: 1,
        status: "idle",
        onActivate: () => undefined,
      }),
      createElement(
        controls.NotificationRowActions,
        {
          title: "Your seat was confirmed",
          unread: true,
          pending: false,
          error: "Could not mark this notification read.",
          onActivate: () => undefined,
          onRetry: () => undefined,
        },
        createElement("span", null, "Notification row"),
      ),
    ),
  );

  assert.match(html, />Mark all read<\/button>/);
  assert.doesNotMatch(html, /Retry mark all read/);
  assert.match(html, /aria-label="Your seat was confirmed, unread"/);
  assert.match(
    html,
    /aria-label="Retry marking Your seat was confirmed read"/,
  );
  assert.match(html, /role="alert"/);
});

test("rendered bulk control exposes pending and retry labels only for bulk state", async () => {
  const controls = await loadControls();
  assert.ok(controls, "notification controls must exist");
  if (!controls) return;

  const pending = renderToStaticMarkup(
    createElement(controls.NotificationBulkReadControl, {
      unread: 2,
      status: "pending",
      onActivate: () => undefined,
    }),
  );
  const failed = renderToStaticMarkup(
    createElement(controls.NotificationBulkReadControl, {
      unread: 2,
      status: "error",
      onActivate: () => undefined,
    }),
  );

  assert.match(pending, /disabled=""/);
  assert.match(pending, />Marking…<\/button>/);
  assert.match(failed, />Retry mark all read<\/button>/);
});

test("row write blocks bulk start until the matching row completion", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one")],
    unread: 1,
    error: null,
  });
  const rowPending = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: "one",
    operationId: 1,
    context: rowContext("one"),
  });
  const blockedBulk = controller.notificationControllerReducer(rowPending, {
    type: "mark-all-start",
    operationId: 2,
  });

  assert.deepEqual(blockedBulk.operation, {
    kind: "row",
    id: "one",
    context: rowContext("one"),
    operationId: 1,
    startedRevision: 0,
  });
  assert.equal(blockedBulk.bulkStatus, "idle");
  assert.equal(blockedBulk.unread, 1);
});

test("bulk write blocks every row start until matching bulk completion", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one"), notification("two")],
    unread: 2,
    error: null,
  });
  const bulkPending = controller.notificationControllerReducer(initial, {
    type: "mark-all-start",
    operationId: 10,
  });
  const blockedRow = controller.notificationControllerReducer(bulkPending, {
    type: "mark-one-start",
    id: "one",
    operationId: 11,
    context: rowContext("one"),
  });

  assert.deepEqual(blockedRow.operation, {
    kind: "bulk",
    operationId: 10,
    startedRevision: 0,
  });
  assert.equal(blockedRow.rowErrorId, null);
  assert.equal(blockedRow.unread, 2);
});

test("stale success and error completions cannot finish a newer operation", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one")],
    unread: 1,
    error: null,
  });
  const pending = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: "one",
    operationId: 20,
    context: rowContext("one"),
  });
  const staleFailure = controller.notificationControllerReducer(pending, {
    type: "mark-one-failed",
    id: "one",
    operationId: 19,
    error: "stale failure",
  });
  const staleSuccess = controller.notificationControllerReducer(staleFailure, {
    type: "mark-one-success",
    id: "one",
    operationId: 19,
    readAt: "2026-07-11T12:06:00.000Z",
  });

  assert.deepEqual(staleFailure, pending);
  assert.deepEqual(staleSuccess, pending);
  assert.equal(staleSuccess.items[0].read_at, null);
  assert.equal(staleSuccess.unread, 1);
});

test("authoritative reconcile clears obsolete terminal feedback", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one")],
    unread: 1,
    error: null,
  });
  const bulkSuccess = controller.notificationControllerReducer(
    controller.notificationControllerReducer(initial, {
      type: "mark-all-start",
      operationId: 30,
    }),
    {
      type: "mark-all-success",
      operationId: 30,
      readAt: "2026-07-11T12:07:00.000Z",
    },
  );
  const afterNewInsert = controller.notificationControllerReducer(bulkSuccess, {
    type: "reconcile",
    snapshot: {
      items: [notification("two")],
      unread: 1,
      error: null,
    },
  });
  const rowFailure = controller.notificationControllerReducer(
    controller.notificationControllerReducer(afterNewInsert, {
      type: "mark-one-start",
      id: "two",
      operationId: 31,
      context: rowContext("two"),
    }),
    {
      type: "mark-one-failed",
      id: "two",
      operationId: 31,
      error: "Could not mark this notification read.",
    },
  );
  const afterExternalRead = controller.notificationControllerReducer(rowFailure, {
    type: "reconcile",
    snapshot: {
      items: [
        notification("two", {
          read_at: "2026-07-11T12:08:00.000Z",
        }),
      ],
      unread: 0,
      error: null,
    },
  });

  assert.equal(afterNewInsert.unread, 1);
  assert.equal(afterNewInsert.bulkStatus, "idle");
  assert.equal(afterNewInsert.bulkError, null);
  assert.equal(afterNewInsert.bulkStatusMessage, null);
  assert.equal(afterExternalRead.rowErrorId, null);
  assert.equal(afterExternalRead.rowError, null);
  assert.equal(afterExternalRead.unread, 0);
});

test("authoritative confirmation clears pending operation and rejects its late completion", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one")],
    unread: 1,
    error: null,
  });
  const pending = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: "one",
    operationId: 40,
    context: rowContext("one"),
  });
  const confirmed = controller.notificationControllerReducer(pending, {
    type: "reconcile",
    snapshot: {
      items: [
        notification("one", {
          read_at: "2026-07-11T12:09:00.000Z",
        }),
      ],
      unread: 0,
      error: null,
    },
  });
  const lateFailure = controller.notificationControllerReducer(confirmed, {
    type: "mark-one-failed",
    id: "one",
    operationId: 40,
    error: "late failure",
  });

  assert.equal(confirmed.operation, null);
  assert.equal(confirmed.unread, 0);
  assert.deepEqual(lateFailure, confirmed);
});

test("bounded eviction preserves the row lock until matching success completes", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const pendingId = "pending";
  const initialItems = [
    notification("one"),
    notification("two"),
    notification("three"),
    notification("four"),
    notification("five"),
    notification("six"),
    notification("seven"),
    notification(pendingId),
  ];
  const initial = controller.createNotificationControllerState({
    items: initialItems,
    unread: 8,
    error: null,
  });
  const pending = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: pendingId,
    operationId: 41,
    context: rowContext(pendingId),
  });
  const evicted = controller.notificationControllerReducer(pending, {
    type: "reconcile",
    snapshot: {
      items: [notification("new"), ...initialItems.slice(0, 7)],
      unread: 9,
      unreadIds: ["new", ...initialItems.map((item) => item.id)],
      error: null,
    },
  });
  const completed = controller.notificationControllerReducer(evicted, {
    type: "mark-one-success",
    id: pendingId,
    operationId: 41,
    readAt: "2026-07-11T12:09:30.000Z",
  });

  assert.equal(evicted.operation?.kind, "row");
  assert.equal(evicted.operation?.operationId, 41);
  assert.equal(evicted.unread, 9);
  assert.equal(completed.operation, null);
  assert.equal(completed.unread, 9);
  assert.deepEqual(
    completed.items.map((item) => item.id),
    evicted.items.map((item) => item.id),
  );
});

test("bounded eviction preserves the row lock until matching failure completes", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const pendingId = "pending";
  const initialItems = [
    notification("one"),
    notification("two"),
    notification("three"),
    notification("four"),
    notification("five"),
    notification("six"),
    notification("seven"),
    notification(pendingId),
  ];
  const initial = controller.createNotificationControllerState({
    items: initialItems,
    unread: 8,
    error: null,
  });
  const pending = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: pendingId,
    operationId: 42,
    context: rowContext(pendingId),
  });
  const evicted = controller.notificationControllerReducer(pending, {
    type: "reconcile",
    snapshot: {
      items: [notification("new"), ...initialItems.slice(0, 7)],
      unread: 9,
      unreadIds: ["new", ...initialItems.map((item) => item.id)],
      error: null,
    },
  });
  const failed = controller.notificationControllerReducer(evicted, {
    type: "mark-one-failed",
    id: pendingId,
    operationId: 42,
    error: "Could not mark this notification read.",
  });

  assert.equal(evicted.operation?.kind, "row");
  assert.equal(evicted.operation?.operationId, 42);
  assert.equal(failed.operation, null);
  assert.equal(failed.rowErrorId, pendingId);
  assert.equal(failed.unread, 9);
  assert.deepEqual(
    failed.items.map((item) => item.id),
    evicted.items.map((item) => item.id),
  );
});

test("complete unread IDs can positively confirm an evicted row is read", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("pending")],
    unread: 1,
    error: null,
  });
  const pending = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: "pending",
    operationId: 43,
    context: rowContext("pending"),
  });
  const confirmed = controller.notificationControllerReducer(pending, {
    type: "reconcile",
    snapshot: {
      items: [notification("new")],
      unread: 1,
      unreadIds: ["new"],
      error: null,
    },
  });

  assert.equal(confirmed.operation, null);
  assert.equal(confirmed.unread, 1);
  assert.deepEqual(confirmed.items.map((item) => item.id), ["new"]);
});

test("authoritative sync during a write prevents stale optimistic completion", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one"), notification("two")],
    unread: 2,
    error: null,
  });
  const pending = controller.notificationControllerReducer(initial, {
    type: "mark-all-start",
    operationId: 50,
  });
  const newerTruth = controller.notificationControllerReducer(pending, {
    type: "reconcile",
    snapshot: {
      items: [notification("three"), notification("one"), notification("two")],
      unread: 3,
      error: null,
    },
  });
  const lateSuccess = controller.notificationControllerReducer(newerTruth, {
    type: "mark-all-success",
    operationId: 50,
    readAt: "2026-07-11T12:10:00.000Z",
  });

  assert.equal(newerTruth.operation?.kind, "bulk");
  assert.equal(newerTruth.authoritativeRevision, 1);
  assert.equal(lateSuccess.operation, null);
  assert.equal(lateSuccess.unread, 3);
  assert.equal(lateSuccess.items.every((item) => item.read_at === null), true);
  assert.equal(lateSuccess.bulkStatus, "idle");
  assert.equal(lateSuccess.bulkStatusMessage, null);
});

test("unauthenticated notification writes throw the sign-in-safe contract", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  assert.equal(typeof controller.requireNotificationWriteAuthentication, "function");
  assert.throws(
    () => controller.requireNotificationWriteAuthentication(null),
    /session expired.*sign in.*retry/i,
  );
  assert.deepEqual(
    controller.requireNotificationWriteAuthentication({ id: "user-1" }),
    { id: "user-1" },
  );
});

test("rendered competing controls are disabled without false pending labels", async () => {
  const controls = await loadControls();
  assert.ok(controls, "notification controls must exist");
  if (!controls) return;

  const bulkBlockedByRow = renderToStaticMarkup(
    createElement(controls.NotificationBulkReadControl, {
      unread: 2,
      status: "idle",
      disabled: true,
      onActivate: () => undefined,
    }),
  );
  const rowBlockedByBulk = renderToStaticMarkup(
    createElement(
      controls.NotificationRowActions,
      {
        title: "Your seat was confirmed",
        unread: true,
        pending: false,
        disabled: true,
        error: null,
        onActivate: () => undefined,
        onRetry: () => undefined,
      },
      createElement("span", null, "Notification row"),
    ),
  );

  assert.match(bulkBlockedByRow, /disabled=""/);
  assert.match(bulkBlockedByRow, />Mark all read<\/button>/);
  assert.doesNotMatch(bulkBlockedByRow, /Marking/);
  assert.match(rowBlockedByBulk, /disabled=""/);
  assert.doesNotMatch(rowBlockedByBulk, /aria-busy="true"/);
});

test("failed authoritative refresh keeps row and bulk operations locked", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const initial = controller.createNotificationControllerState({
    items: [notification("one")],
    unread: 1,
    error: null,
  });
  const rowPending = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: "one",
    operationId: 60,
    context: rowContext("one"),
  });
  const failedRowRefresh = controller.notificationControllerReducer(rowPending, {
    type: "reconcile-failed",
    error: "Could not refresh notifications.",
  });
  const bulkPending = controller.notificationControllerReducer(initial, {
    type: "mark-all-start",
    operationId: 61,
  });
  const failedBulkRefresh = controller.notificationControllerReducer(bulkPending, {
    type: "reconcile-failed",
    error: "Could not refresh notifications.",
  });

  assert.deepEqual(failedRowRefresh.operation, rowPending.operation);
  assert.equal(failedRowRefresh.authoritativeRevision, 0);
  assert.deepEqual(failedRowRefresh.items, []);
  assert.equal(failedRowRefresh.unread, 0);
  assert.deepEqual(failedBulkRefresh.operation, bulkPending.operation);
});

test("evicted row failure retains safe retry context and destination", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const context = rowContext("pending");
  const initial = controller.createNotificationControllerState({
    items: [notification("pending")],
    unread: 1,
    error: null,
  });
  const pending = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: "pending",
    operationId: 62,
    context,
  });
  const evicted = controller.notificationControllerReducer(pending, {
    type: "reconcile",
    snapshot: {
      items: [notification("new")],
      unread: 2,
      unreadIds: ["new", "pending"],
      error: null,
    },
  });
  const failed = controller.notificationControllerReducer(evicted, {
    type: "mark-one-failed",
    id: "pending",
    operationId: 62,
    error: "Could not mark this notification read.",
  });

  assert.deepEqual(failed.rowErrorContext, context);
  assert.equal(failed.rowErrorId, "pending");
  assert.equal(failed.items.some((item) => item.id === "pending"), false);
  assert.deepEqual(controller.notificationEvictedRowRetry(failed), {
    context,
    error: "Could not mark this notification read.",
  });
});

test("returning unread row moves retry inline without a duplicate global control", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const context = rowContext("pending");
  const initial = controller.createNotificationControllerState({
    items: [notification("pending")],
    unread: 1,
    error: null,
  });
  const failed = controller.notificationControllerReducer(
    controller.notificationControllerReducer(initial, {
      type: "mark-one-start",
      id: "pending",
      operationId: 63,
      context,
    }),
    {
      type: "mark-one-failed",
      id: "pending",
      operationId: 63,
      error: "Could not mark this notification read.",
    },
  );
  const returned = controller.notificationControllerReducer(failed, {
    type: "reconcile",
    snapshot: {
      items: [notification("pending")],
      unread: 1,
      unreadIds: ["pending"],
      error: null,
    },
  });

  assert.deepEqual(returned.rowErrorContext, context);
  assert.equal(returned.rowError, "Could not mark this notification read.");
  assert.equal(controller.notificationEvictedRowRetry(returned), null);
});

test("evicted retry remains exclusive and preserves context through success and failure", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  const context = rowContext("pending");
  const initial = {
    ...controller.createNotificationControllerState({
      items: [notification("new")],
      unread: 2,
      error: null,
    }),
    rowErrorId: "pending",
    rowError: "Could not mark this notification read.",
    rowErrorContext: context,
  };
  const retrying = controller.notificationControllerReducer(initial, {
    type: "mark-one-start",
    id: "pending",
    operationId: 64,
    context,
  });
  const blockedBulk = controller.notificationControllerReducer(retrying, {
    type: "mark-all-start",
    operationId: 65,
  });
  const failedAgain = controller.notificationControllerReducer(retrying, {
    type: "mark-one-failed",
    id: "pending",
    operationId: 64,
    error: "Could not mark this notification read.",
  });
  const retryingAgain = controller.notificationControllerReducer(failedAgain, {
    type: "mark-one-start",
    id: "pending",
    operationId: 66,
    context: failedAgain.rowErrorContext ?? context,
  });
  const succeeded = controller.notificationControllerReducer(retryingAgain, {
    type: "mark-one-success",
    id: "pending",
    operationId: 66,
    readAt: "2026-07-11T12:11:00.000Z",
  });

  assert.deepEqual(blockedBulk.operation, retrying.operation);
  assert.equal(retrying.operation?.kind, "row");
  assert.equal(retrying.operation?.context.destination, context.destination);
  assert.deepEqual(failedAgain.rowErrorContext, context);
  assert.equal(succeeded.operation, null);
  assert.equal(succeeded.rowErrorContext, null);
  assert.equal(succeeded.unread, 2);
});

test("rendered evicted fallback exposes one specifically named retry", async () => {
  const controls = await loadControls();
  assert.ok(controls, "notification controls must exist");
  if (!controls) return;

  assert.equal(typeof controls.NotificationEvictedRowRetry, "function");
  const html = renderToStaticMarkup(
    createElement(controls.NotificationEvictedRowRetry, {
      title: "Your seat was confirmed",
      error: "Could not mark this notification read.",
      pending: false,
      onRetry: () => undefined,
    }),
  );

  assert.match(html, /role="alert"/);
  assert.match(
    html,
    /aria-label="Retry marking Your seat was confirmed read"/,
  );
  assert.equal((html.match(/>Retry<\/button>/g) ?? []).length, 1);
});

test("ride cancellation reason remains available to the mobile renderer", async () => {
  const controller = await loadController();
  assert.ok(controller, "notification controller must exist");
  if (!controller) return;

  assert.equal(
    controller.notificationCancellationReason(
      notification("cancelled", {
        type: "ride_cancelled",
        message: "Driver is unavailable",
      }),
    ),
    "Driver is unavailable",
  );
  assert.equal(
    controller.notificationCancellationReason(notification("confirmed")),
    null,
  );
});

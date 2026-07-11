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
  });
  const succeeded = controller.notificationControllerReducer(pending, {
    type: "mark-one-success",
    id: "one",
    readAt: "2026-07-11T12:02:00.000Z",
  });

  assert.equal(pending.rowPendingId, "one");
  assert.equal(succeeded.unread, 1);
  assert.equal(succeeded.items[0].read_at, "2026-07-11T12:02:00.000Z");
  assert.equal(succeeded.items[1].read_at, null);
  assert.equal(succeeded.rowPendingId, null);
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
    }),
    {
      type: "mark-one-failed",
      id: "one",
      error: "Could not mark this notification read.",
    },
  );
  const retrying = controller.notificationControllerReducer(failed, {
    type: "mark-one-start",
    id: "one",
  });
  const retried = controller.notificationControllerReducer(retrying, {
    type: "mark-one-success",
    id: "one",
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
    controller.notificationControllerReducer(initial, { type: "mark-all-start" }),
    {
      type: "mark-all-failed",
      error: "Could not mark notifications read.",
    },
  );
  const retrying = controller.notificationControllerReducer(failed, {
    type: "mark-all-start",
  });
  const retried = controller.notificationControllerReducer(retrying, {
    type: "mark-all-success",
    readAt: "2026-07-11T12:04:00.000Z",
  });

  assert.equal(failed.unread, 2);
  assert.equal(failed.items.every((item) => item.read_at === null), true);
  assert.equal(failed.bulkStatus, "error");
  assert.equal(failed.rowErrorId, null);
  assert.equal(retrying.bulkStatus, "pending");
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

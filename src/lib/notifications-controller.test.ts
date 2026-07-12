import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createSurfaceRefreshDebouncer,
  notificationTriggersSurfaceRefresh,
  subscribeToNotificationChanges,
} from "./notifications-controller";

const provider = readFileSync(
  fileURLToPath(new URL("../components/notifications-provider.tsx", import.meta.url)),
  "utf8",
);
const mobileSheet = readFileSync(
  fileURLToPath(new URL("../components/mobile/notifications-sheet.tsx", import.meta.url)),
  "utf8",
);

test("notificationTriggersSurfaceRefresh truth table", () => {
  for (const type of [
    "seat_requested",
    "seat_confirmed",
    "seat_declined",
    "seat_cancelled",
    "ride_cancelled",
    "ride_completed",
    "request_accepted",
    "event_request_approved",
    "event_request_rejected",
  ] as const) {
    assert.equal(notificationTriggersSurfaceRefresh(type), true, type);
  }
  assert.equal(notificationTriggersSurfaceRefresh("new_message"), false);
  assert.equal(notificationTriggersSurfaceRefresh("unknown_type"), false);
  assert.equal(notificationTriggersSurfaceRefresh(undefined), false);
  assert.equal(notificationTriggersSurfaceRefresh(null), false);
});

test("surface refresh debouncer coalesces in-window calls and cleans up", () => {
  let refreshCount = 0;
  const debouncer = createSurfaceRefreshDebouncer(() => {
    refreshCount += 1;
  }, 400, 1500);

  debouncer.schedule();
  debouncer.schedule();
  debouncer.schedule();
  assert.equal(refreshCount, 0);

  debouncer.cancel();
  debouncer.schedule();
  assert.equal(refreshCount, 0);
});

test("surface refresh debouncer flushes after debounce window", async () => {
  let refreshCount = 0;
  const debouncer = createSurfaceRefreshDebouncer(() => {
    refreshCount += 1;
  }, 50, 500);

  debouncer.schedule();
  debouncer.schedule();
  debouncer.schedule();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(refreshCount, 1);
  debouncer.cancel();
});

test("subscribeToNotificationChanges forwards notification type from payload", () => {
  const handlers = new Map<string, (payload: { new?: { type?: string } }) => void>();
  const channel = {
    on(
      _kind: "postgres_changes",
      filter: { event: string },
      handler: (payload: { new?: { type?: string } }) => void,
    ) {
      handlers.set(filter.event, handler);
      return channel;
    },
    subscribe() {
      return channel;
    },
  };
  const client = {
    channel() {
      return channel;
    },
    removeChannel() {},
  };
  const changes: Array<{ event: string; type: string | undefined }> = [];
  const cleanup = subscribeToNotificationChanges(client, "bell", "user-1", (change) => {
    changes.push(change);
  });

  handlers.get("INSERT")?.({ new: { type: "seat_confirmed" } });
  handlers.get("UPDATE")?.({ new: { type: "new_message" } });
  cleanup();

  assert.deepEqual(changes, [
    { event: "INSERT", type: "seat_confirmed" },
    { event: "UPDATE", type: "new_message" },
  ]);
});

test("desktop and mobile notification channels share gated surface refresh", () => {
  assert.match(provider, /notificationTriggersSurfaceRefresh/);
  assert.match(provider, /createSurfaceRefreshDebouncer/);
  assert.match(provider, /router\.refresh/);
  assert.match(mobileSheet, /notificationTriggersSurfaceRefresh/);
  assert.match(mobileSheet, /createSurfaceRefreshDebouncer/);
  assert.match(mobileSheet, /router\.refresh/);
  assert.doesNotMatch(provider, /new_message[\s\S]*router\.refresh/);
});

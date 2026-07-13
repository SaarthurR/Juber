import test from "node:test";
import assert from "node:assert/strict";
import type { NotificationWithContext } from "@/lib/types";
import {
  desktopNotificationHref,
  mobileNotificationHref,
} from "./notification-href";

function eventNotification(
  overrides: Partial<NotificationWithContext> = {},
): NotificationWithContext {
  return {
    id: "n-1",
    recipient_id: "user-1",
    actor_id: "admin-1",
    type: "event_request_approved",
    ride_id: null,
    request_id: null,
    conversation_id: null,
    event_id: "event-1",
    report_id: null,
    message: null,
    read_at: null,
    created_at: "2026-07-11T12:00:00.000Z",
    actor: { id: "admin-1", full_name: "Admin", avatar_url: null },
    ride: null,
    request: null,
    event: { id: "event-1", name: "Paryushan", slug: "paryushan-2026" },
    ...overrides,
  };
}

test("href priority prefers ride, request, event, then conversation", () => {
  const base = eventNotification();
  assert.equal(desktopNotificationHref({ ...base, ride_id: "ride-1" }), "/rides/ride-1");
  assert.equal(
    desktopNotificationHref({ ...base, ride_id: null, request_id: "req-1" }),
    "/requests/req-1",
  );
  assert.equal(desktopNotificationHref(base), "/events/paryushan-2026");
  assert.equal(
    desktopNotificationHref({
      ...base,
      event_id: null,
      event: null,
      conversation_id: "conv-1",
    }),
    "/messages/conv-1",
  );
});

test("rejected event request notifications fall back to events status page", () => {
  assert.equal(
    desktopNotificationHref(
      eventNotification({
        type: "event_request_rejected",
        event_id: null,
        event: null,
      }),
    ),
    "/events",
  );
  assert.equal(
    mobileNotificationHref(
      eventNotification({
        type: "event_request_rejected",
        event_id: null,
        event: null,
      }),
    ),
    "/m/events",
  );
});

test("mobile href mirrors desktop event slug routes", () => {
  assert.equal(mobileNotificationHref(eventNotification()), "/m/events/paryushan-2026");
});

test("moderation reports deep-link to the selected report on each surface", () => {
  const notification = eventNotification({
    type: "moderation_report_submitted",
    event_id: null,
    event: null,
    actor_id: null,
    actor: null,
    report_id: "00000000-0000-4000-8000-000000000123",
  });
  assert.equal(
    desktopNotificationHref(notification),
    "/admin/moderation?report=00000000-0000-4000-8000-000000000123",
  );
  assert.equal(
    mobileNotificationHref(notification),
    "/m/admin?report=00000000-0000-4000-8000-000000000123",
  );
});

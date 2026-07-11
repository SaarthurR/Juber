import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const mobileSheet = readFileSync(
  fileURLToPath(new URL("./mobile/notifications-sheet.tsx", import.meta.url)),
  "utf8",
);
const desktopBell = readFileSync(
  fileURLToPath(new URL("./notification-bell.tsx", import.meta.url)),
  "utf8",
);
const desktopTab = readFileSync(
  fileURLToPath(new URL("../app/messages/page.tsx", import.meta.url)),
  "utf8",
);
const markReadOwner = readFileSync(
  fileURLToPath(new URL("./notifications-mark-read.tsx", import.meta.url)),
  "utf8",
);
const messagesNavLink = readFileSync(
  fileURLToPath(new URL("./messages-nav-link.tsx", import.meta.url)),
  "utf8",
);

test("mobile notification sheet owns exactly one realtime channel with insert and update reconciliation", () => {
  const mobileChannelCount = (mobileSheet.match(/\.channel\(/g) ?? []).length;

  assert.equal(mobileChannelCount, 1);
  assert.match(mobileSheet, /`mobile-notifications:\$\{userId\}`/);
  assert.match(mobileSheet, /event: "INSERT"/);
  assert.match(mobileSheet, /event: "UPDATE"/);
  assert.match(mobileSheet, /loadVisibleNotificationIds\(supabase, null, true\)/);
  assert.match(mobileSheet, /loadVisibleNotificationIds\(supabase, 8, false\)/);
});

test("mobile opening the notification sheet does not mark notifications read", () => {
  const openHandler = mobileSheet.match(/function open_\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.doesNotMatch(openHandler, /markNotificationsRead/);
});

test("mobile rows mark one notification before shell-safe navigation and expose retry on failure", () => {
  assert.match(mobileSheet, /markNotificationRead\(n\.id\)/);
  assert.match(mobileSheet, /router\.push\(href\)/);
  assert.match(mobileSheet, /mobileNotificationDestination\(n\)/);
  assert.match(mobileSheet, /Retry/);
  assert.match(mobileSheet, /role="alert"/);
});

test("mobile mark-all control has pending, disabled, success, error, and retry states", () => {
  assert.match(mobileSheet, /Mark all read/);
  assert.match(mobileSheet, /disabled=\{[^}]*markingAll/);
  assert.match(mobileSheet, /Marking/);
  assert.match(mobileSheet, /All notifications marked read/);
  assert.match(mobileSheet, /Could not mark notifications read/);
  assert.match(mobileSheet, /Retry/);
  assert.match(mobileSheet, /aria-live="polite"/);
});

test("desktop notification tab mounts one retryable mark-read owner and bell stays sole live owner", () => {
  assert.match(desktopTab, /<NotificationsMarkRead hasUnread=\{hasUnread\} \/>/);
  assert.match(markReadOwner, /Retry/);
  assert.match(markReadOwner, /done\.current = false/);
  assert.equal((desktopBell.match(/\.channel\(/g) ?? []).length, 1);
  assert.doesNotMatch(messagesNavLink, /\.channel\(/);
  assert.doesNotMatch(desktopBell, /setInterval/);
});

test("hidden unsafe notification paths stay fail-closed without stale click leakage", () => {
  assert.match(mobileSheet, /failClosedNotificationState<NotificationWithContext>/);
  assert.match(desktopBell, /failClosedNotificationState<NotificationWithContext>/);
  assert.match(mobileSheet, /setItems\(failed\.items\)/);
  assert.match(mobileSheet, /setUnread\(failed\.unread\)/);
  assert.match(desktopBell, /setItems\(failed\.items\)/);
});

test("mobile ride cancellation renders the cancellation reason like desktop", () => {
  assert.match(
    mobileSheet,
    /\(n\.type === "ride_cancelled" \|\| n\.type === "seat_cancelled"\) && n\.message/,
  );
});

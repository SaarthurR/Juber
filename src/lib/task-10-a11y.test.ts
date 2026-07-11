import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { DesktopDialog } from "@/components/ui/desktop-dialog";
import {
  contrastRatio,
  nextFocusableIndex,
  shouldDismissLayer,
} from "@/lib/dialog-a11y";

test("focus cycle helper wraps Tab and Shift+Tab within a layer", () => {
  assert.equal(nextFocusableIndex(0, 3, "backward"), 2);
  assert.equal(nextFocusableIndex(2, 3, "forward"), 0);
  assert.equal(nextFocusableIndex(1, 3, "forward"), 2);
});

test("dismissal helper blocks backdrop and Escape while pending", () => {
  assert.equal(shouldDismissLayer({ pending: true, reason: "escape" }), false);
  assert.equal(shouldDismissLayer({ pending: true, reason: "backdrop" }), false);
  assert.equal(shouldDismissLayer({ pending: false, reason: "escape" }), true);
  assert.equal(shouldDismissLayer({ pending: false, reason: "close-button" }), true);
});

test("desktop dialog renders minimum accessible semantics and visible close", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      DesktopDialog,
      {
        open: true,
        onDismiss: () => {},
        labelledBy: "cancel-title",
        closeLabel: "Keep ride",
      },
      React.createElement("h2", { id: "cancel-title" }, "Cancel this ride?"),
    ),
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="cancel-title"/);
  assert.match(html, /aria-label="Keep ride"/);
});

test("bottom sheet renders equivalent accessible semantics and visible close", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      BottomSheet,
      {
        open: true,
        onClose: () => {},
        labelledBy: "contact-title",
        closeLabel: "Close contact sheet",
      },
      React.createElement("p", { id: "contact-title" }, "Contact driver"),
    ),
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="contact-title"/);
  assert.match(html, /aria-label="Close contact sheet"/);
});

test("dialog and sheet callers pass pending dismissal guards", () => {
  const rideActions = readFileSync("src/components/ride-actions.tsx", "utf8");
  const notificationsSheet = readFileSync("src/components/mobile/notifications-sheet.tsx", "utf8");
  const contactSheet = readFileSync("src/components/mobile/contact-sheet.tsx", "utf8");

  assert.match(rideActions, /dismissDisabled=\{pending\}/);
  assert.match(notificationsSheet, /dismissDisabled=\{notificationWritePending\(state\)\}/);
  assert.match(contactSheet, /dismissDisabled=\{pendingActionOpen\}/);
});

test("verified foreground/background color pairs meet AA contrast", () => {
  const pairs = [
    ["muted on cream", "#57534e", "#fbf7f0"],
    ["warm muted on white", "#7a6858", "#ffffff"],
    ["warm muted on tint", "#6f5b48", "#f6e9da"],
    ["light hero text on brand", "#fbe8d2", "#a65329"],
    ["inactive mobile tab on white", "#6f5b48", "#ffffff"],
    ["stone secondary text on white", "#57534e", "#ffffff"],
  ] as const;

  for (const [label, foreground, background] of pairs) {
    assert.ok(
      contrastRatio(foreground, background) >= 4.5,
      `${label} should meet AA`,
    );
  }
});

test("terms and privacy are reachable from unauthenticated desktop and mobile profile surfaces", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const mobileProfile = readFileSync("src/app/m/profile/page.tsx", "utf8");

  assert.match(layout, /href="\/terms"/);
  assert.match(layout, /href="\/privacy"/);
  assert.match(mobileProfile, /href="\/terms"/);
  assert.match(mobileProfile, /href="\/privacy"/);
  assert.match(mobileProfile, /!user[\s\S]*href="\/terms"[\s\S]*href="\/privacy"/);
});

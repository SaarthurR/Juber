import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import * as BottomNavModule from "@/components/mobile/bottom-nav";
import * as ContactSheetModule from "@/components/mobile/contact-sheet";
import * as LandingAuthGateModule from "@/components/landing-auth-gate";
import * as SiteChromeModule from "@/components/site-chrome";
import { RideCard, RequestCard } from "@/components/ride-card";
import { Segmented } from "@/components/mobile/segmented";
import { PendingActionGroup } from "@/components/pending-action-button";
import { DesktopDialog } from "@/components/ui/desktop-dialog";
import {
  contrastRatio,
  nextFocusableIndex,
  shouldDismissLayer,
} from "@/lib/dialog-a11y";
import type { RideRequestWithRider, RideWithDriver } from "@/lib/types";

const authGateExports = LandingAuthGateModule as unknown as {
  LandingSignInDialog?: React.ComponentType<{
    open: boolean;
    onDismiss: () => void;
    nextPath: string;
  }>;
  PublicLegalLinks?: React.ComponentType;
  shouldInterceptAuthAction?: (input: {
    hasAction: boolean;
    authAllowed: boolean;
  }) => boolean;
  landingAuthNextPath?: (href: string | null, pathname: string) => string;
};

const bottomNavExports = BottomNavModule as unknown as {
  BottomNavView?: React.ComponentType<{ pathname: string }>;
};

const contactSheetExports = ContactSheetModule as unknown as {
  ContactSheetContent?: React.ComponentType<{
    driverId: string;
    driverFullName: string | null;
    rideId: string;
    phone: string | null;
    whatsapp: string | null;
    preferredContact: "phone" | "whatsapp" | "message" | null;
    defaultOpen?: boolean;
  }>;
};

const siteChromeExports = SiteChromeModule as unknown as {
  FooterTagline?: React.ComponentType;
};

const PendingGroupWithInitialState = PendingActionGroup as React.ComponentType<{
  children?: React.ReactNode;
  initialPendingKey?: string | null;
}>;

const profile = {
  id: "person-1",
  full_name: "Ari Shah",
  avatar_url: null,
  neighborhood: "Fremont",
  instagram: null,
  pronouns: null,
  preferred_contact: "message" as const,
  car_make_model: null,
  car_color: null,
  bio: null,
  is_admin: false,
  created_at: "2026-07-01T00:00:00.000Z",
};

const ride: RideWithDriver = {
  id: "ride-1",
  driver_id: profile.id,
  origin_label: "Fremont",
  destination_label: "JCNC",
  pickup_location: null,
  dropoff_location: null,
  depart_at: "2026-08-01T09:00:00.000Z",
  round_trip: false,
  return_depart_at: null,
  return_notes: null,
  seats_total: 3,
  seats_available: 2,
  gas_contribution: null,
  notes: null,
  event_id: null,
  status: "active",
  cancellation_reason: null,
  created_at: "2026-07-01T00:00:00.000Z",
  driver: profile,
  event: null,
};

const request: RideRequestWithRider = {
  id: "request-1",
  rider_id: profile.id,
  origin_label: "Sunnyvale",
  destination_label: "JCNC",
  depart_at: "2026-08-01T09:00:00.000Z",
  earliest_date: null,
  latest_date: null,
  max_price: null,
  seats_needed: 2,
  notes: null,
  event_id: null,
  status: "active",
  accepted_driver_id: null,
  accepted_at: null,
  created_at: "2026-07-01T00:00:00.000Z",
  rider: profile,
  event: null,
};

test("focus cycle helper wraps Tab and Shift+Tab within a layer", () => {
  assert.equal(nextFocusableIndex(0, 3, "backward"), 2);
  assert.equal(nextFocusableIndex(2, 3, "forward"), 0);
  assert.equal(nextFocusableIndex(1, 3, "forward"), 2);
});

test("dismissal helper blocks backdrop and Escape while pending", () => {
  assert.equal(shouldDismissLayer({ pending: true, reason: "escape" }), false);
  assert.equal(shouldDismissLayer({ pending: true, reason: "backdrop" }), false);
  assert.equal(shouldDismissLayer({ pending: true, reason: "close-button" }), false);
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

test("landing sign-in prompt renders through the accessible dialog contract", () => {
  const Dialog = authGateExports.LandingSignInDialog;
  assert.equal(typeof Dialog, "function");
  if (!Dialog) return;

  const html = renderToStaticMarkup(
    React.createElement(Dialog, {
      open: true,
      onDismiss: () => {},
      nextPath: "/m/rides/ride-1",
    }),
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="landing-auth-title"/);
  assert.match(html, /aria-label="Close sign-in prompt"/);
  assert.match(html, /Sign in with Google/);
});

test("signed-out legal controls render as comfortable public browse targets", () => {
  const PublicLegalLinks = authGateExports.PublicLegalLinks;
  assert.equal(typeof PublicLegalLinks, "function");
  if (!PublicLegalLinks) return;

  const html = renderToStaticMarkup(React.createElement(PublicLegalLinks));
  const links = html.match(/<a [^>]+>/g) ?? [];

  assert.equal(links.length, 2);
  for (const link of links) {
    assert.match(link, /data-auth-allowed="true"/);
    assert.match(link, /min-h-11/);
    assert.match(link, /focus-visible:outline-2/);
  }
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy"/);
});

test("production auth-gate decision lets rendered legal controls navigate", () => {
  const shouldIntercept = authGateExports.shouldInterceptAuthAction;
  assert.equal(typeof shouldIntercept, "function");
  if (!shouldIntercept) return;

  assert.equal(shouldIntercept({ hasAction: true, authAllowed: true }), false);
  assert.equal(shouldIntercept({ hasAction: true, authAllowed: false }), true);
  assert.equal(shouldIntercept({ hasAction: false, authAllowed: false }), false);
});

test("bottom navigation exposes Profile browsing while keeping actions gated", () => {
  const BottomNavView = bottomNavExports.BottomNavView;
  const shouldIntercept = authGateExports.shouldInterceptAuthAction;
  assert.equal(typeof BottomNavView, "function");
  assert.equal(typeof shouldIntercept, "function");
  if (!BottomNavView || !shouldIntercept) return;

  const html = renderToStaticMarkup(
    React.createElement(BottomNavView, { pathname: "/m" }),
  );
  const profileLink = html.match(/<a [^>]*href="\/m\/profile"[^>]*>/)?.[0] ?? "";
  const postLink = html.match(/<a [^>]*href="\/m\/rides\/new"[^>]*>/)?.[0] ?? "";

  assert.match(profileLink, /data-auth-allowed="true"/);
  assert.equal(
    shouldIntercept({
      hasAction: true,
      authAllowed: profileLink.includes('data-auth-allowed="true"'),
    }),
    false,
  );
  assert.doesNotMatch(postLink, /data-auth-allowed/);
  assert.equal(
    shouldIntercept({
      hasAction: true,
      authAllowed: postLink.includes('data-auth-allowed="true"'),
    }),
    true,
  );
});

test("landing auth next-path helper preserves the attempted destination", () => {
  const resolveNextPath = authGateExports.landingAuthNextPath;
  assert.equal(typeof resolveNextPath, "function");
  if (!resolveNextPath) return;

  const ridePath = "/m/rides/123e4567-e89b-12d3-a456-426614174000";
  assert.equal(resolveNextPath(ridePath, "/m"), ridePath);
  assert.equal(resolveNextPath(null, "/m/profile"), "/m/profile");
});

test("dialog and sheet callers pass pending dismissal guards", () => {
  const rideActions = readFileSync("src/components/ride-actions.tsx", "utf8");
  const notificationsSheet = readFileSync("src/components/mobile/notifications-sheet.tsx", "utf8");
  const contactSheet = readFileSync("src/components/mobile/contact-sheet.tsx", "utf8");

  assert.match(rideActions, /dismissDisabled=\{pending\}/);
  assert.match(notificationsSheet, /dismissDisabled=\{notificationWritePending\(state\)\}/);
  assert.match(contactSheet, /dismissDisabled=\{pendingActionOpen\}/);
});

test("contact sheet action and dismissal guard share one pending provider", () => {
  const ContactSheetContent = contactSheetExports.ContactSheetContent;
  assert.equal(typeof ContactSheetContent, "function");
  if (!ContactSheetContent) return;

  const driverId = "driver-1";
  const rideId = "ride-1";
  const actionKey = `mobile-contact-message-${rideId}-${driverId}`;
  const html = renderToStaticMarkup(
    React.createElement(
      PendingGroupWithInitialState,
      { initialPendingKey: actionKey },
      React.createElement(ContactSheetContent, {
        driverId,
        driverFullName: "Ari Shah",
        rideId,
        phone: null,
        whatsapp: null,
        preferredContact: "message",
        defaultOpen: true,
      }),
    ),
  );
  const closeButton =
    html.match(/<button [^>]*aria-label="Close contact sheet"[^>]*>/)?.[0] ?? "";

  assert.match(closeButton, /disabled/);
  assert.match(html, /Opening chat\.\.\./);
  assert.doesNotMatch(html, />In-app message<\/button>/);
});

test("verified foreground/background color pairs meet AA contrast", () => {
  const pairs = [
    ["muted on cream", "#57534e", "#fbf7f0", 4.5],
    ["warm muted on white", "#7a6858", "#ffffff", 4.5],
    ["warm muted on tint", "#6f5b48", "#f6e9da", 4.5],
    ["light hero text on brand", "#fbe8d2", "#a65329", 4.5],
    ["inactive mobile tab on seg track", "#6f5b48", "#f1e4d2", 4.5],
    ["ride-card warm text on white", "#6f5b48", "#ffffff", 6],
    ["footer links on cream", "#6f5b48", "#fbf7f0", 5.5],
    ["footer tagline on cream", "#6f5b48", "#fbf7f0", 5.5],
    ["footer brand link on cream", "#a65329", "#fbf7f0", 5],
  ] as const;

  for (const [label, foreground, background, minimum] of pairs) {
    assert.ok(
      contrastRatio(foreground, background) >= minimum,
      `${label} should meet its contrast target`,
    );
  }
});

test("footer tagline renders the measured warm token on cream", () => {
  const FooterTagline = siteChromeExports.FooterTagline;
  assert.equal(typeof FooterTagline, "function");
  if (!FooterTagline) return;

  const html = renderToStaticMarkup(React.createElement(FooterTagline));

  assert.match(html, /text-sand-text/);
  assert.ok(contrastRatio("#6f5b48", "#fbf7f0") >= 5.5);
});

test("segmented control renders the verified inactive token on its real track", () => {
  const html = renderToStaticMarkup(
    React.createElement(Segmented, {
      options: [
        { value: "rides", label: "Rides" },
        { value: "requests", label: "Requests" },
      ],
      value: "rides",
      onChange: () => {},
    }),
  );

  assert.match(html, /bg-seg-track/);
  assert.match(html, /text-sand-text/);
});

test("ride and request cards render no Lighthouse-failed text colors", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(RideCard, { ride }),
      React.createElement(RequestCard, { request }),
    ),
  );

  assert.doesNotMatch(html, /#b09d86/i);
  assert.doesNotMatch(html, /#a8927a/i);
  assert.doesNotMatch(html, /text-stone-400/);
  assert.match(html, /text-sand-text/);
});

test("desktop footer uses margin-safe link colors and public legal routes", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const footer = layout.slice(layout.indexOf("<footer"), layout.indexOf("</footer>"));

  assert.match(footer, /href="\/terms"/);
  assert.match(footer, /href="\/privacy"/);
  assert.equal((footer.match(/space-y-1\.5 text-sand-text/g) ?? []).length, 3);
  assert.doesNotMatch(footer, /space-y-1\.5 text-stone-500/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as routeTargets from "./route-targets";
import {
  AUTH_CALLBACK_TARGETS,
  MESSAGE_BASE_TARGETS,
  RIDE_LIST_TARGETS,
  authCallbackDestination,
  mobileNotificationDestination,
  pickAllowed,
  requestListDestination,
  requestRevalidationTargets,
  rideDetailDestination,
} from "./route-targets";

const authOnboardingDestination = (
  routeTargets as typeof routeTargets & {
    authOnboardingDestination?: (mobile: boolean, next: unknown) => string;
  }
).authOnboardingDestination;

test("pickAllowed returns fallback for disallowed values", () => {
  const allowed = ["/events"] as const;
  const fallback = "/rides";

  assert.equal(pickAllowed("//evil", allowed, fallback), fallback);
  assert.equal(pickAllowed("/admin", allowed, fallback), fallback);
  assert.equal(pickAllowed("/rides", allowed, fallback), fallback);
});

test("pickAllowed keeps an allow-listed value", () => {
  const allowed = ["/events"] as const;

  assert.equal(pickAllowed("/events", allowed, "/rides"), "/events");
});

test("message bases include mobile and reject unsafe returns", () => {
  assert.equal(pickAllowed("/m/messages", MESSAGE_BASE_TARGETS, "/messages"), "/m/messages");
  assert.equal(pickAllowed("//evil.test/messages", MESSAGE_BASE_TARGETS, "/messages"), "/messages");
  assert.equal(pickAllowed("/m/messages/abc", MESSAGE_BASE_TARGETS, "/messages"), "/messages");
});

test("ride list bases include mobile and reject unsafe returns", () => {
  assert.equal(pickAllowed("/m", RIDE_LIST_TARGETS, "/rides"), "/m");
  assert.equal(pickAllowed("/m/rides", RIDE_LIST_TARGETS, "/rides"), "/rides");
  assert.equal(pickAllowed("/admin", RIDE_LIST_TARGETS, "/rides"), "/rides");
  assert.equal(pickAllowed("https://evil.test/rides", RIDE_LIST_TARGETS, "/rides"), "/rides");
});

test("every allow-listed base has an app page", () => {
  const targets = [
    ...AUTH_CALLBACK_TARGETS,
    ...MESSAGE_BASE_TARGETS,
    ...RIDE_LIST_TARGETS,
  ];

  for (const target of targets) {
    const page = fileURLToPath(new URL(`../app${target}/page.tsx`, import.meta.url));
    assert.equal(existsSync(page), true, `${target} must resolve to an app page`);
  }
});

test("mobile filesystem routes exist without stale /m/rides list root", () => {
  const existingRoutes = [
    "/m",
    "/m/rides/new",
    "/m/rides/[id]",
    "/m/events",
    "/m/events/[slug]",
    "/m/requests",
    "/m/requests/[id]",
    "/m/messages",
    "/m/messages/[id]",
    "/m/profile",
    "/m/profile/[id]",
  ];

  for (const target of existingRoutes) {
    const page = fileURLToPath(new URL(`../app${target}/page.tsx`, import.meta.url));
    assert.equal(existsSync(page), true, `${target} must resolve to an app page`);
  }

  const staleListRoot = fileURLToPath(new URL("../app/m/rides/page.tsx", import.meta.url));
  assert.equal(existsSync(staleListRoot), false, "/m/rides must not be introduced as a list root");
});

test("OAuth next accepts only closed route patterns", () => {
  const allowed = [
    "/m",
    "/m/rides/new",
    "/m/rides/123e4567-e89b-12d3-a456-426614174000",
    "/m/events/paryushan-2026",
    "/m/requests/123e4567-e89b-12d3-a456-426614174000",
    "/m/messages/123e4567-e89b-12d3-a456-426614174000",
    "/m/profile/123e4567-e89b-12d3-a456-426614174000",
  ];

  for (const target of allowed) {
    assert.equal(authCallbackDestination(target, "/rides"), target);
  }

  const rejected = [
    "//evil.test/m",
    "https://evil.test/m",
    "/admin",
    "/m/rides",
    "/m/profile/edit",
    "/m/rides/not-a-uuid",
    "/m/events/../../admin",
    "/m/messages/abc",
  ];

  for (const target of rejected) {
    assert.equal(authCallbackDestination(target, "/rides"), "/rides");
  }
});

test("OAuth next preserves canonical event context on mobile create routes", () => {
  const eventId = "123e4567-e89b-42d3-a456-426614174000";

  assert.equal(
    authCallbackDestination(`/m/rides/new?event_id=${eventId}`),
    `/m/rides/new?event_id=${eventId}`,
  );
  assert.equal(
    authCallbackDestination(`/m/requests/new?event_id=${eventId}`),
    `/m/requests/new?event_id=${eventId}`,
  );
});

test("OAuth next preserves canonical event context on desktop create routes", () => {
  const eventId = "123E4567-E89B-42D3-A456-426614174000";
  const canonicalId = eventId.toLowerCase();

  assert.equal(
    authCallbackDestination(`/rides/new?event_id=${eventId}`),
    `/rides/new?event_id=${canonicalId}`,
  );
  assert.equal(
    authCallbackDestination(`/requests/new?event_id=${eventId}`),
    `/requests/new?event_id=${canonicalId}`,
  );
});

test("OAuth next preserves only the used rides tab", () => {
  assert.equal(authCallbackDestination("/rides?tab=requests"), "/rides?tab=requests");
  assert.equal(authCallbackDestination("/rides?tab=notifications"), "/rides");
  assert.equal(authCallbackDestination("/m?tab=requests"), "/m");
});

test("OAuth next drops unknown, invalid, duplicate, and misplaced query parameters", () => {
  const eventId = "123e4567-e89b-42d3-a456-426614174000";

  assert.equal(
    authCallbackDestination(
      `/m/rides/new?utm_source=invite&event_id=${eventId}&next=%2Fadmin#details`,
    ),
    `/m/rides/new?event_id=${eventId}`,
  );
  assert.equal(authCallbackDestination("/m/requests/new?event_id=not-a-uuid"), "/m/requests/new");
  assert.equal(
    authCallbackDestination(
      `/rides/new?event_id=${eventId}&event_id=${eventId}`,
    ),
    "/rides/new",
  );
  assert.equal(
    authCallbackDestination("/rides?tab=requests&tab=requests"),
    "/rides",
  );
  assert.equal(
    authCallbackDestination(`/rides?event_id=${eventId}&tab=requests#requests`),
    "/rides?tab=requests",
  );
  assert.equal(
    authCallbackDestination(`/events?event_id=${eventId}&tab=requests`),
    "/events",
  );
});

test("OAuth next rejects encoded path attacks and drops encoded query attacks", () => {
  const eventId = "123e4567-e89b-42d3-a456-426614174000";

  for (const target of [
    "/m/events/%2e%2e/%2e%2e/admin",
    "/m%5crides/new",
    "/m/rides/%0a123e4567-e89b-42d3-a456-426614174000",
    "/%2f%2fevil.test/m",
  ]) {
    assert.equal(authCallbackDestination(target, "/rides"), "/rides");
  }

  assert.equal(
    authCallbackDestination(`/m/rides/new?event_id=${eventId}%5cadmin`),
    "/m/rides/new",
  );
  assert.equal(
    authCallbackDestination("/rides?tab=requests%0d%0aLocation%3A%20%2Fadmin"),
    "/rides",
  );
});

test("OAuth next normalizes unsafe input to a safe fallback", () => {
  for (const target of [
    null,
    "",
    "//evil.test/m",
    "https://evil.test/m",
    "/admin?next=/m",
  ]) {
    assert.equal(authCallbackDestination(target, "/m"), "/m");
  }
  assert.equal(authCallbackDestination("//evil.test/m", "//evil.test"), "/rides");
});

test("sign-in without an explicit next includes the current safe query", () => {
  const authButton = readFileSync(
    fileURLToPath(new URL("../components/auth-button.tsx", import.meta.url)),
    "utf8",
  );

  assert.match(
    authButton,
    /window\.location\.pathname.*window\.location\.search/,
  );
});

test("first-time OAuth preserves event context through desktop and mobile onboarding", () => {
  if (!authOnboardingDestination) return;
  const eventId = "123e4567-e89b-42d3-a456-426614174000";

  assert.equal(
    authOnboardingDestination(false, `/rides/new?event_id=${eventId}`),
    `/profile?onboarding=1&next=%2Frides%2Fnew%3Fevent_id%3D${eventId}`,
  );
  assert.equal(
    authOnboardingDestination(false, `/requests/new?event_id=${eventId}`),
    `/profile?onboarding=1&next=%2Frequests%2Fnew%3Fevent_id%3D${eventId}`,
  );
  assert.equal(
    authOnboardingDestination(true, `/m/rides/new?event_id=${eventId}`),
    `/m/profile/edit?onboarding=1&next=%2Fm%2Frides%2Fnew%3Fevent_id%3D${eventId}`,
  );
  assert.equal(
    authOnboardingDestination(true, `/m/requests/new?event_id=${eventId}`),
    `/m/profile/edit?onboarding=1&next=%2Fm%2Frequests%2Fnew%3Fevent_id%3D${eventId}`,
  );
});

test("first-time OAuth preserves the desktop rides tab through onboarding", () => {
  if (!authOnboardingDestination) return;
  assert.equal(
    authOnboardingDestination(false, "/rides?tab=requests"),
    "/profile?onboarding=1&next=%2Frides%3Ftab%3Drequests",
  );
});

test("onboarding uses shell-safe fallbacks for missing, invalid, duplicate, and encoded next", () => {
  if (!authOnboardingDestination) return;
  const eventId = "123e4567-e89b-42d3-a456-426614174000";

  assert.equal(
    authOnboardingDestination(false, undefined),
    "/profile?onboarding=1&next=%2Frides",
  );
  assert.equal(
    authOnboardingDestination(true, "https://evil.test/m"),
    "/m/profile/edit?onboarding=1&next=%2Fm",
  );
  assert.equal(
    authOnboardingDestination(false, [
      `/rides/new?event_id=${eventId}`,
      "/admin",
    ]),
    "/profile?onboarding=1&next=%2Frides",
  );
  assert.equal(
    authOnboardingDestination(true, "/m/rides/new%5c..%5cadmin"),
    "/m/profile/edit?onboarding=1&next=%2Fm",
  );
});

test("route targets expose a sanitized onboarding destination builder", () => {
  assert.equal(typeof authOnboardingDestination, "function");
});

test("callback and contact gate pass only sanitized next into the correct profile shell", () => {
  const callback = readFileSync(
    fileURLToPath(new URL("../app/auth/callback/route.ts", import.meta.url)),
    "utf8",
  );
  const gate = readFileSync(
    fileURLToPath(new URL("../components/contact-required-gate.tsx", import.meta.url)),
    "utf8",
  );

  assert.match(callback, /searchParams\.getAll\("next"\)/);
  assert.match(callback, /authCallbackDestination/);
  assert.match(callback, /authOnboardingDestination/);
  assert.match(gate, /window\.location\.pathname.*window\.location\.search/);
  assert.match(gate, /authCallbackDestination/);
  assert.match(gate, /new URLSearchParams/);
  assert.match(gate, /"\/m\/profile\/edit"/);
  assert.match(gate, /"\/profile"/);
});

test("profile forms re-sanitize one next value and render a hidden handoff", () => {
  const desktopPage = readFileSync(
    fileURLToPath(new URL("../app/profile/page.tsx", import.meta.url)),
    "utf8",
  );
  const mobilePage = readFileSync(
    fileURLToPath(new URL("../app/m/profile/edit/page.tsx", import.meta.url)),
    "utf8",
  );

  for (const page of [desktopPage, mobilePage]) {
    assert.match(page, /next\?: string \| string\[\]/);
    assert.match(page, /authCallbackDestination/);
    assert.match(page, /nextValues\.length === 1/);
    assert.match(page, /<input type="hidden" name="next" value=\{safeNext\} \/>/);
  }
  assert.match(desktopPage, /`\/profile\/\$\{user\.id\}`/);
  assert.match(mobilePage, /"\/m\/profile"/);
});

test("profile actions preserve canonical next and keep normal edit fallbacks", () => {
  const desktopAction = readFileSync(
    fileURLToPath(new URL("../app/profile/actions.ts", import.meta.url)),
    "utf8",
  );
  const mobileAction = readFileSync(
    fileURLToPath(new URL("../app/m/actions.ts", import.meta.url)),
    "utf8",
  );

  for (const action of [desktopAction, mobileAction]) {
    assert.match(action, /formData\.getAll\("next"\)/);
    assert.match(action, /nextValues\.length === 1/);
    assert.match(action, /authCallbackDestination/);
    assert.match(action, /revalidatePath\(destination\)/);
    assert.match(action, /redirect\(destination\)/);
    assert.match(action, /URLSearchParams/);
  }
  assert.match(desktopAction, /const fallback = `\/profile\/\$\{user\.id\}`/);
  assert.match(mobileAction, /const fallback = "\/m\/profile"/);
  assert.match(desktopAction, /redirect\("\/profile\?contact_required=1"\)/);
  assert.match(mobileAction, /redirect\("\/m\/profile\/edit\?contact_required=1"\)/);
});

test("mobile notifications map to concrete detail pages only", () => {
  assert.equal(
    mobileNotificationDestination({ ride_id: "ride-123" }),
    "/m/rides/ride-123",
  );
  assert.equal(
    mobileNotificationDestination({ request_id: "request-123" }),
    "/m/requests/request-123",
  );
  assert.equal(
    mobileNotificationDestination({ conversation_id: "conversation-123" }),
    "/m/messages/conversation-123",
  );
  assert.equal(mobileNotificationDestination({}), null);
  assert.notEqual(mobileNotificationDestination({ ride_id: "ride-123" }), "/m/rides");
});

test("mobile shell links stay under actual mobile routes", () => {
  const bottomNav = readFileSync(
    fileURLToPath(new URL("../components/mobile/bottom-nav.tsx", import.meta.url)),
    "utf8",
  );
  const mobileRide = readFileSync(
    fileURLToPath(new URL("../app/m/rides/[id]/page.tsx", import.meta.url)),
    "utf8",
  );
  const mobileThread = readFileSync(
    fileURLToPath(new URL("../app/m/messages/[id]/page.tsx", import.meta.url)),
    "utf8",
  );
  const mobileCards = readFileSync(
    fileURLToPath(new URL("../components/mobile/mobile-cards.tsx", import.meta.url)),
    "utf8",
  );

  assert.match(bottomNav, /href="\/m\/rides\/new"/);
  assert.doesNotMatch(bottomNav, /href="\/rides\/new"/);
  assert.match(mobileRide, /href=\{`\/m\/events\/\$\{ride\.event\.slug\}`\}/);
  assert.match(mobileRide, /href=\{`\/m\/profile\/\$\{ride\.driver_id\}`\}/);
  assert.match(mobileRide, /href=\{`\/m\/profile\/\$\{p\.passenger_id\}`\}/);
  assert.match(mobileRide, /next=\{`\/m\/rides\/\$\{ride\.id\}`\}/);
  assert.match(mobileThread, /profileBase="\/m\/profile"/);
  assert.match(mobileCards, /href=\{`\/m\/rides\/\$\{ride\.id\}`\}[\s\S]*data-auth-allowed="true"/);
});

test("mobile public profile is lean, read-only, and self-redirecting", () => {
  const page = readFileSync(
    fileURLToPath(new URL("../app/m/profile/[id]/page.tsx", import.meta.url)),
    "utf8",
  );

  assert.match(page, /if \(user\?\.id === id\) redirect\("\/m\/profile"\)/);
  assert.match(page, /getProfileContactContext/);
  assert.match(page, /getContact\(supabase, id\)/);
  assert.match(page, /CONTACT_LOCKED_MESSAGE/);
  assert.match(page, /<input type="hidden" name="base" value="\/m\/messages" \/>/);
  assert.doesNotMatch(page, /ProfileTabs|RideCard|RequestCard|tab=/);
});

test("mobile post and profile writes revalidate mobile pages", () => {
  const rideActions = readFileSync(
    fileURLToPath(new URL("../app/rides/actions.ts", import.meta.url)),
    "utf8",
  );
  const mobileActions = readFileSync(
    fileURLToPath(new URL("../app/m/actions.ts", import.meta.url)),
    "utf8",
  );
  const mobileNewRide = readFileSync(
    fileURLToPath(new URL("../app/m/rides/new/page.tsx", import.meta.url)),
    "utf8",
  );

  assert.match(mobileNewRide, /base="\/m"/);
  assert.match(rideActions, /const base = pickAllowed\(formData\.get\("base"\)\?\.toString\(\), RIDE_LIST_TARGETS, "\/rides"\)/);
  assert.match(rideActions, /revalidatePath\("\/m"\);[\s\S]*redirect\(base\)/);
  assert.match(mobileActions, /revalidatePath\("\/rides"\);[\s\S]*revalidatePath\("\/m"\);[\s\S]*revalidatePath\("\/m\/requests"\)/);
  assert.match(mobileActions, /revalidatePath\("\/profile"\);[\s\S]*revalidatePath\("\/m\/profile"\)/);
});

test("request actions revalidate desktop and mobile list and detail routes", () => {
  assert.deepEqual(requestRevalidationTargets("request-123"), [
    "/rides",
    "/requests",
    "/m",
    "/m/requests",
    "/requests/request-123",
    "/m/requests/request-123",
  ]);
});

test("request cancellation returns only to existing list pages", () => {
  assert.equal(requestListDestination("/rides"), "/rides?tab=requests");
  assert.equal(requestListDestination("/m"), "/m");
  assert.equal(requestListDestination("/m/rides"), "/rides?tab=requests");
});

test("seat cancellation returns to an existing ride detail page", () => {
  assert.equal(rideDetailDestination("/rides", "ride-123"), "/rides/ride-123");
  assert.equal(rideDetailDestination("/m", "ride-123"), "/m/rides/ride-123");
  assert.equal(rideDetailDestination("/m/rides", "ride-123"), "/rides/ride-123");
});

import { mobileNotificationHref } from "@/lib/notification-href";
import type { EventRow, NotificationType } from "@/lib/types";

export const AUTH_CALLBACK_TARGETS = [
  "/rides",
  "/rides/new",
  "/requests/new",
  "/events",
  "/messages",
  "/profile",
  "/m",
  "/m/rides/new",
  "/m/requests/new",
  "/m/requests",
  "/m/events",
  "/m/messages",
  "/m/profile",
] as const;
export const MESSAGE_BASE_TARGETS = ["/messages", "/m/messages"] as const;
export const RIDE_LIST_TARGETS = ["/rides", "/m"] as const;
export const DESKTOP_COOKIE = "force-desktop";

const AUTH_ORIGIN = "https://juber.invalid";
const UUID_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_VALUE = new RegExp(`^${UUID_SEGMENT}$`, "i");
const AUTH_CALLBACK_PATTERNS = [
  /^\/events\/[a-z0-9-]+$/,
  /^\/m\/events\/[a-z0-9-]+$/,
  new RegExp(`^/rides/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/m/rides/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/requests/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/m/requests/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/messages/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/m/messages/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/profile/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/m/profile/${UUID_SEGMENT}$`, "i"),
];
const EVENT_CONTEXT_TARGETS = new Set([
  "/rides/new",
  "/requests/new",
  "/m/rides/new",
  "/m/requests/new",
]);

export function pickAllowed<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function authCallbackDestination(value: unknown, fallback = "/rides") {
  return normalizeAuthCallbackDestination(value)
    ?? normalizeAuthCallbackDestination(fallback)
    ?? "/rides";
}

export function desktopAuthDestination(destination: unknown, fallback = "/rides") {
  const canonicalDestination = authCallbackDestination(destination, fallback);
  const parsed = new URL(canonicalDestination, AUTH_ORIGIN);
  let desktopDestination: string;

  if (parsed.pathname === "/m") {
    desktopDestination = "/rides";
  } else if (parsed.pathname === "/m/requests") {
    desktopDestination = "/rides?tab=requests";
  } else if (parsed.pathname.startsWith("/m/")) {
    desktopDestination = `${parsed.pathname.slice(2)}${parsed.search}`;
  } else {
    return canonicalDestination;
  }

  return authCallbackDestination(desktopDestination, "/rides");
}

export function authOnboardingDestination(
  nextValue: unknown,
  {
    fallback,
    forceDesktop = false,
  }: {
    fallback: "/rides" | "/m";
    forceDesktop?: boolean;
  },
) {
  const candidate = Array.isArray(nextValue)
    ? nextValue.length === 1
      ? nextValue[0]
      : null
    : nextValue;
  const canonicalNext = authCallbackDestination(candidate, fallback);
  const next = forceDesktop
    ? desktopAuthDestination(canonicalNext, "/rides")
    : canonicalNext;
  const search = new URLSearchParams({ onboarding: "1", next });
  const isMobileDestination = next === "/m" || next.startsWith("/m/");
  const profilePath =
    isMobileDestination && !forceDesktop ? "/m/profile/edit" : "/profile";
  return `${profilePath}?${search.toString()}`;
}

/** Redirect target when a write action needs contact info before continuing. */
export function contactSetupDestination(
  attemptedPath: unknown,
  { mobile = false }: { mobile?: boolean } = {},
) {
  const fallback = mobile ? "/m" : "/rides";
  const next = authCallbackDestination(attemptedPath, fallback);
  const search = new URLSearchParams({ contact_required: "1", next });
  const profilePath = mobile ? "/m/profile/edit" : "/profile";
  return `${profilePath}?${search.toString()}`;
}

export function contactActionReturnPath(
  formData: FormData | undefined,
  fallback: string,
) {
  const returnTo = formData?.get("return_to")?.toString();
  if (returnTo) return authCallbackDestination(returnTo, fallback);

  const rideId = formData?.get("ride_id")?.toString();
  const requestId = formData?.get("request_id")?.toString();
  const base = formData?.get("base")?.toString() ?? "";
  const mobile = base.startsWith("/m") || fallback.startsWith("/m");
  if (rideId) return mobile ? `/m/rides/${rideId}` : `/rides/${rideId}`;
  if (requestId) return mobile ? `/m/requests/${requestId}` : `/requests/${requestId}`;
  return authCallbackDestination(base || fallback, fallback);
}

export function authRevalidationPath(destination: unknown, fallback = "/rides") {
  const canonicalDestination = authCallbackDestination(destination, fallback);
  return new URL(canonicalDestination, AUTH_ORIGIN).pathname;
}

function normalizeAuthCallbackDestination(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (/[\u0000-\u001f\\]/.test(value)) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, AUTH_ORIGIN);
    if (parsed.origin !== AUTH_ORIGIN) return null;
  } catch {
    return null;
  }

  const { pathname, searchParams } = parsed;
  const isAllowedPath =
    (AUTH_CALLBACK_TARGETS as readonly string[]).includes(pathname)
    || AUTH_CALLBACK_PATTERNS.some((pattern) => pattern.test(pathname));
  if (!isAllowedPath) return null;

  const canonicalQuery = new URLSearchParams();
  if (EVENT_CONTEXT_TARGETS.has(pathname)) {
    const eventIds = searchParams.getAll("event_id");
    if (eventIds.length === 1 && UUID_VALUE.test(eventIds[0])) {
      canonicalQuery.set("event_id", eventIds[0].toLowerCase());
    }
  } else if (pathname === "/rides") {
    const tabs = searchParams.getAll("tab");
    if (tabs.length === 1 && tabs[0] === "requests") {
      canonicalQuery.set("tab", "requests");
    }
  }

  const query = canonicalQuery.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function requestRevalidationTargets(requestId: string) {
  return [
    "/rides",
    "/requests",
    "/m",
    "/m/requests",
    `/requests/${requestId}`,
    `/m/requests/${requestId}`,
  ];
}

export function requestListDestination(value: unknown) {
  const base = pickAllowed(value, RIDE_LIST_TARGETS, "/rides");
  return base === "/m" ? "/m" : "/rides?tab=requests";
}

export function rideDetailDestination(value: unknown, rideId: string) {
  const base = pickAllowed(value, RIDE_LIST_TARGETS, "/rides");
  return base === "/m" ? `/m/rides/${rideId}` : `/rides/${rideId}`;
}

export function mobileNotificationDestination({
  ride_id,
  request_id,
  conversation_id,
  event_id,
  type,
  event,
}: {
  ride_id?: string | null;
  request_id?: string | null;
  conversation_id?: string | null;
  event_id?: string | null;
  type?: NotificationType;
  event?: Pick<EventRow, "slug"> | null;
}) {
  return mobileNotificationHref({
    ride_id: ride_id ?? null,
    request_id: request_id ?? null,
    conversation_id: conversation_id ?? null,
    event_id: event_id ?? null,
    type: type ?? "seat_requested",
    event: event ?? null,
  });
}

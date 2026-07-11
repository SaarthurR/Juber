export const AUTH_CALLBACK_TARGETS = [
  "/rides",
  "/rides/new",
  "/requests/new",
  "/events",
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
  const next = authCallbackDestination(candidate, fallback);
  const search = new URLSearchParams({ onboarding: "1", next });
  const isMobileDestination = next === "/m" || next.startsWith("/m/");
  const profilePath =
    isMobileDestination && !forceDesktop ? "/m/profile/edit" : "/profile";
  return `${profilePath}?${search.toString()}`;
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
}: {
  ride_id?: string | null;
  request_id?: string | null;
  conversation_id?: string | null;
}) {
  if (ride_id) return `/m/rides/${ride_id}`;
  if (request_id) return `/m/requests/${request_id}`;
  if (conversation_id) return `/m/messages/${conversation_id}`;
  return null;
}

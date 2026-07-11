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

const AUTH_CALLBACK_PATTERNS = [
  /^\/events\/[a-z0-9-]+$/,
  /^\/m\/events\/[a-z0-9-]+$/,
  /^\/rides\/[0-9a-f-]{8,}$/,
  /^\/m\/rides\/[0-9a-f-]{8,}$/,
  /^\/requests\/[0-9a-f-]{8,}$/,
  /^\/m\/requests\/[0-9a-f-]{8,}$/,
  /^\/messages\/[0-9a-f-]{8,}$/,
  /^\/m\/messages\/[0-9a-f-]{8,}$/,
  /^\/profile\/[0-9a-f-]{8,}$/,
  /^\/m\/profile\/[0-9a-f-]{8,}$/,
];

export function pickAllowed<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function authCallbackDestination(value: unknown, fallback = "/rides") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;

  let pathname: string;
  try {
    const parsed = new URL(value, "https://juber.invalid");
    if (parsed.origin !== "https://juber.invalid") return fallback;
    pathname = parsed.pathname;
  } catch {
    return fallback;
  }

  if ((AUTH_CALLBACK_TARGETS as readonly string[]).includes(pathname)) return pathname;
  return AUTH_CALLBACK_PATTERNS.some((pattern) => pattern.test(pathname)) ? pathname : fallback;
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

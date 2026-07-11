export const AUTH_CALLBACK_TARGETS = ["/rides", "/events", "/m/events"] as const;
export const MESSAGE_BASE_TARGETS = ["/messages", "/m/messages"] as const;
export const RIDE_LIST_TARGETS = ["/rides", "/m"] as const;

export function pickAllowed<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value as T) ? (value as T) : fallback;
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

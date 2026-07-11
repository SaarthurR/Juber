export const AUTH_CALLBACK_TARGETS = ["/rides", "/events", "/m/events"] as const;
export const MESSAGE_BASE_TARGETS = ["/messages", "/m/messages"] as const;

export function pickAllowed<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value as T) ? (value as T) : fallback;
}

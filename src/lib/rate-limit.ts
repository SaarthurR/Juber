export type RateLimitErrorLike = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

const SCOPE_COPY: Record<string, string> = {
  message_burst: "You're sending messages too fast.",
  message_hour: "You've sent too many messages this hour.",
  ride_burst: "You've posted too many rides recently.",
  ride_day: "You've reached the daily ride posting limit.",
  request_burst: "You've posted too many requests recently.",
  request_day: "You've reached the daily request posting limit.",
};

export function isRateLimitError(err: RateLimitErrorLike | null | undefined): boolean {
  return err?.code === "JB429";
}

function parseScope(details: string | null | undefined): string | null {
  if (!details) return null;
  const match = /scope=([a-z_]+)/.exec(details);
  return match?.[1] ?? null;
}

function parseRetrySeconds(hint: string | null | undefined): number | null {
  if (!hint) return null;
  const match = /retry_after_seconds=(\d+)/.exec(hint);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function formatRetry(retrySeconds: number | null): string {
  if (retrySeconds == null || retrySeconds <= 0) {
    return "Wait a moment and try again.";
  }
  if (retrySeconds < 60) {
    return `Wait about ${retrySeconds} second${retrySeconds === 1 ? "" : "s"} and try again.`;
  }
  const minutes = Math.ceil(retrySeconds / 60);
  if (minutes < 60) {
    return `Wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
  }
  const hours = Math.ceil(minutes / 60);
  return `Wait about ${hours} hour${hours === 1 ? "" : "s"} and try again.`;
}

export function mapRateLimitError(err: RateLimitErrorLike | null | undefined): string | null {
  if (!err || !isRateLimitError(err)) return null;
  const scope = parseScope(err.details);
  const base = (scope && SCOPE_COPY[scope]) ?? "You're doing that too fast.";
  return `${base} ${formatRetry(parseRetrySeconds(err.hint))}`;
}

export function mapInsertError(
  err: RateLimitErrorLike & { message?: string | null },
  fallbackMessage: string,
  mapOther?: (message: string) => string,
): string {
  return (
    mapRateLimitError(err) ??
    mapOther?.(err.message ?? "") ??
    err.message ??
    fallbackMessage
  );
}

const MAX_EVENT_SOURCE_URL_LENGTH = 2048;

export function parseEventSourceUrl(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.length > MAX_EVENT_SOURCE_URL_LENGTH) return null;
  if (raw.startsWith("//")) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (/\s/.test(parsed.href)) return null;
  return parsed.href;
}

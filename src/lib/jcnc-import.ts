export const JCNC_ICS_URL = "https://jcnc.org/events/?ical=1";
export const JCNC_FETCH_TIMEOUT_MS = 10_000;
export const JCNC_VENUE_LABEL = "JCNC, Milpitas";

export type JcncParsedEvent = {
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
  venue_label: string;
};

export type JcncImportPlan = {
  rows: JcncParsedEvent[];
  imported: number;
  skipped: number;
};

export type JcncImportSummaryMessage = {
  status: "success" | "info" | "error";
  message: string;
};

function unfoldIcs(text: string) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function unescapeIcs(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

export function dateFromIcs(value: string, endDate = false) {
  const raw = value.trim().slice(0, 8);
  if (!/^\d{8}$/.test(raw)) return null;
  const date = new Date(
    Date.UTC(
      Number(raw.slice(0, 4)),
      Number(raw.slice(4, 6)) - 1,
      Number(raw.slice(6, 8)),
    ),
  );
  if (endDate) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function parseJcncIcs(text: string): JcncParsedEvent[] {
  const events: JcncParsedEvent[] = [];
  for (const block of unfoldIcs(text).split("BEGIN:VEVENT").slice(1)) {
    const lines = block.split(/\r?\n/);
    const get = (field: string) => {
      const line = lines.find((l) => l.startsWith(field) || l.startsWith(`${field};`));
      return line ? unescapeIcs(line.slice(line.indexOf(":") + 1)) : null;
    };

    const name = get("SUMMARY");
    if (!name) continue;

    events.push({
      name,
      description: get("DESCRIPTION"),
      start_date: dateFromIcs(get("DTSTART") ?? ""),
      end_date: dateFromIcs(get("DTEND") ?? "", true),
      source_url: get("URL"),
      venue_label: JCNC_VENUE_LABEL,
    });
  }
  return events;
}

function daysBetween(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

export function likelyHighTraffic(event: JcncParsedEvent) {
  const haystack = `${event.name} ${event.description ?? ""}`.toLowerCase();
  const keywords = [
    "anniversary",
    "paryushan",
    "das lakshan",
    "mahavir",
    "janma",
    "picnic",
    "mela",
    "festival",
    "maha",
    "kalyanak",
    "pratistha",
    "cultural",
    "yatra",
  ];
  return (
    daysBetween(event.start_date, event.end_date) >= 2 ||
    keywords.some((k) => haystack.includes(k))
  );
}

export function normalizeDedupeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function jcncUrlDedupeKey(source: string, sourceUrl: string) {
  return `url:${source}:${normalizeDedupeText(sourceUrl)}`;
}

export function jcncContentDedupeKey(
  source: string,
  name: string,
  startDate: string | null,
  venueLabel: string | null,
) {
  return `content:${source}:${normalizeDedupeText(name)}:${startDate ?? ""}:${normalizeDedupeText(venueLabel)}`;
}

export function jcncEventDedupeKey(event: JcncParsedEvent, source = "jcnc") {
  if (event.source_url) {
    return jcncUrlDedupeKey(source, event.source_url);
  }
  return jcncContentDedupeKey(source, event.name, event.start_date, event.venue_label);
}

export function planJcncImport(
  candidates: JcncParsedEvent[],
  existingKeys: Set<string>,
  source = "jcnc",
): JcncImportPlan {
  const seen = new Set(existingKeys);
  const rows: JcncParsedEvent[] = [];
  let skipped = 0;

  for (const event of candidates) {
    const key = jcncEventDedupeKey(event, source);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    rows.push(event);
  }

  return {
    rows,
    imported: rows.length,
    skipped,
  };
}

export function summarizeJcncImport(plan: JcncImportPlan): JcncImportSummaryMessage {
  if (plan.imported === 0 && plan.skipped === 0) {
    return {
      status: "info",
      message: "No new high-traffic JCNC events to import.",
    };
  }

  if (plan.imported === 0) {
    return {
      status: "info",
      message: `No new JCNC events imported. Skipped ${plan.skipped} duplicate${plan.skipped === 1 ? "" : "s"}.`,
    };
  }

  const skippedSuffix =
    plan.skipped > 0
      ? ` Skipped ${plan.skipped} duplicate${plan.skipped === 1 ? "" : "s"}.`
      : "";

  return {
    status: "success",
    message: `Imported ${plan.imported} JCNC event${plan.imported === 1 ? "" : "s"}.${skippedSuffix}`,
  };
}

export function jcncFetchErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "JCNC calendar timed out. Try again in a moment.";
    }
    if (error.message) return error.message;
  }
  return "Could not load JCNC calendar.";
}

export async function fetchJcncCalendar(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = JCNC_FETCH_TIMEOUT_MS,
) {
  try {
    const response = await fetchImpl(JCNC_ICS_URL, {
      headers: { accept: "text/calendar" },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      throw new Error("Could not load JCNC calendar.");
    }
    return await response.text();
  } catch (error) {
    throw new Error(jcncFetchErrorMessage(error));
  }
}

export function buildJcncImportRows(
  events: JcncParsedEvent[],
  requestedBy: string,
  source = "jcnc",
) {
  return events.map((event) => ({
    name: event.name,
    description: event.description
      ? `Likely high-traffic JCNC event imported from jcnc.org.\n\n${event.description}`
      : "Likely high-traffic JCNC event imported from jcnc.org.",
    venue_label: event.venue_label,
    start_date: event.start_date,
    end_date: event.end_date,
    source,
    source_url: event.source_url,
    expected_traffic: "high" as const,
    requested_by: requestedBy,
  }));
}

export function collectExistingJcncDedupeKeys(
  rows: Array<{
    source: string;
    source_url: string | null;
    name: string;
    start_date: string | null;
    venue_label: string | null;
  }>,
) {
  const keys = new Set<string>();
  for (const row of rows) {
    keys.add(
      row.source_url
        ? jcncUrlDedupeKey(row.source, row.source_url)
        : jcncContentDedupeKey(row.source, row.name, row.start_date, row.venue_label),
    );
  }
  return keys;
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  JCNC_FETCH_TIMEOUT_MS,
  buildJcncImportRows,
  collectExistingJcncDedupeKeys,
  dateFromIcs,
  fetchJcncCalendar,
  jcncContentDedupeKey,
  jcncEventDedupeKey,
  jcncFetchErrorMessage,
  likelyHighTraffic,
  parseJcncIcs,
  planJcncImport,
  summarizeJcncImport,
} from "./jcnc-import";

const SAMPLE_ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "SUMMARY:Paryushan 2026",
  "DESCRIPTION:Community week",
  "DTSTART;VALUE=DATE:20260820",
  "DTEND;VALUE=DATE:20260825",
  "URL:https://jcnc.org/events/paryushan-2026/",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:Youth Picnic",
  "DTSTART;VALUE=DATE:20260704",
  "DTEND;VALUE=DATE:20260704",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("parseJcncIcs extracts URL and URL-less events with venue label", () => {
  const events = parseJcncIcs(SAMPLE_ICS);

  assert.equal(events.length, 2);
  assert.equal(events[0]?.name, "Paryushan 2026");
  assert.equal(events[0]?.source_url, "https://jcnc.org/events/paryushan-2026/");
  assert.equal(events[0]?.start_date, "2026-08-20");
  assert.equal(events[0]?.end_date, "2026-08-24");
  assert.equal(events[0]?.venue_label, "JCNC, Milpitas");
  assert.equal(events[1]?.source_url, null);
});

test("dateFromIcs converts all-day ICS dates safely", () => {
  assert.equal(dateFromIcs("20260820"), "2026-08-20");
  assert.equal(dateFromIcs("20260825", true), "2026-08-24");
  assert.equal(dateFromIcs("bad"), null);
});

test("likelyHighTraffic keeps multi-day and keyword events", () => {
  const events = parseJcncIcs(SAMPLE_ICS);
  assert.equal(likelyHighTraffic(events[0]!), true);
  assert.equal(likelyHighTraffic(events[1]!), true);
});

test("jcncEventDedupeKey uses URL for linked events and content key for URL-less rows", () => {
  const events = parseJcncIcs(SAMPLE_ICS);
  assert.equal(
    jcncEventDedupeKey(events[0]!),
    "url:jcnc:https://jcnc.org/events/paryushan-2026/",
  );
  assert.equal(
    jcncEventDedupeKey(events[1]!),
    jcncContentDedupeKey("jcnc", "Youth Picnic", "2026-07-04", "JCNC, Milpitas"),
  );
});

test("planJcncImport skips existing rows and duplicates within the same batch", () => {
  const events = parseJcncIcs(SAMPLE_ICS).filter(likelyHighTraffic);
  const duplicateBatch = [...events, events[1]!];
  const existing = new Set([jcncEventDedupeKey(events[0]!)]);

  const plan = planJcncImport(duplicateBatch, existing);

  assert.deepEqual(plan, {
    rows: [events[1]!],
    imported: 1,
    skipped: 2,
  });
});

test("collectExistingJcncDedupeKeys normalizes stored rows", () => {
  const keys = collectExistingJcncDedupeKeys([
    {
      source: "jcnc",
      source_url: "https://jcnc.org/events/paryushan-2026/",
      name: "ignored",
      start_date: null,
      venue_label: null,
    },
    {
      source: "jcnc",
      source_url: null,
      name: " Youth Picnic ",
      start_date: "2026-07-04",
      venue_label: " JCNC, Milpitas ",
    },
  ]);

  assert.equal(keys.size, 2);
  assert.equal(keys.has("url:jcnc:https://jcnc.org/events/paryushan-2026/"), true);
  assert.equal(keys.has("content:jcnc:youth picnic:2026-07-04:jcnc, milpitas"), true);
});

test("summarizeJcncImport never reports false success on zero imports", () => {
  assert.deepEqual(summarizeJcncImport({ rows: [], imported: 0, skipped: 0 }), {
    status: "info",
    message: "No new high-traffic JCNC events to import.",
  });
  assert.deepEqual(summarizeJcncImport({ rows: [], imported: 0, skipped: 2 }), {
    status: "info",
    message: "No new JCNC events imported. Skipped 2 duplicates.",
  });
  assert.match(
    summarizeJcncImport({ rows: [{} as never], imported: 1, skipped: 1 }).message,
    /Imported 1 JCNC event\. Skipped 1 duplicate\./,
  );
});

test("buildJcncImportRows stamps JCNC metadata for inserts", () => {
  const [row] = buildJcncImportRows(parseJcncIcs(SAMPLE_ICS).slice(0, 1), "admin-1");
  assert.equal(row.source, "jcnc");
  assert.equal(row.expected_traffic, "high");
  assert.equal(row.requested_by, "admin-1");
  assert.match(row.description ?? "", /Likely high-traffic JCNC event imported from jcnc\.org\./);
});

test("fetchJcncCalendar uses an explicit timeout and surfaces fetch failures", async () => {
  const calls: RequestInit[] = [];
  await assert.rejects(
    () =>
      fetchJcncCalendar(async (_url, init) => {
        calls.push(init ?? {});
        throw Object.assign(new Error("Timeout"), { name: "TimeoutError" });
      }, 25),
    /timed out/,
  );

  assert.ok(calls[0]?.signal);
  assert.equal(JCNC_FETCH_TIMEOUT_MS, 10_000);
});

test("jcncFetchErrorMessage preserves non-timeout failures", () => {
  assert.equal(jcncFetchErrorMessage(new Error("Could not load JCNC calendar.")), "Could not load JCNC calendar.");
  assert.match(jcncFetchErrorMessage(Object.assign(new Error("aborted"), { name: "AbortError" })), /timed out/);
});

test("0022 migration keeps approve_event_request admin-only and row-locked", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../supabase/migrations/0022_demo_backend_hardening.sql", import.meta.url)),
    "utf8",
  );

  assert.match(sql, /create or replace function public\.approve_event_request\(p_request_id uuid\)/i);
  assert.match(sql, /if not public\.is_admin\(\)/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /if v_req\.status <> 'pending'/i);
  assert.match(sql, /grant execute on function public\.approve_event_request\(uuid\) to authenticated/i);
});

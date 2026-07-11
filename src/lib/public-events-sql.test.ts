import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(
  new URL("../../supabase/migrations/0030_public_events.sql", import.meta.url),
);

test("0030 public events migration defines privacy-safe RPCs", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /create or replace function public\.public_upcoming_events\(\)/i);
  assert.match(sql, /create or replace function public\.public_event_board\(p_slug text\)/i);
  assert.match(sql, /security definer\s+set search_path = public/i);
  assert.match(sql, /coalesce\(e\.end_date, e\.start_date\) >= current_date/i);
  assert.match(sql, /from public\.public_upcoming_rides\(null, null, null, 100, null\)/i);
  assert.doesNotMatch(sql, /from public\.ride_requests/i);
  assert.doesNotMatch(sql, /rider_id|requested_by|driver_id/i);
});

test("0030 public events migration grants only RPC execution to anon", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /revoke all on function public\.public_upcoming_events\(\) from public/i);
  assert.match(sql, /revoke all on function public\.public_event_board\(text\) from public/i);
  assert.match(sql, /grant execute on function public\.public_upcoming_events\(\) to anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.public_event_board\(text\) to anon, authenticated/i);
  assert.doesNotMatch(sql, /grant select on (table )?public\.events to anon/i);
  assert.doesNotMatch(sql, /grant select on (table )?public\.ride_requests to anon/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(
  new URL("../../supabase/migrations/0033_fresh_sweep_closure.sql", import.meta.url),
);
const publicSourceUrlMigrationPath = fileURLToPath(
  new URL(
    "../../supabase/migrations/20260712145411_public_event_source_url_rpc.sql",
    import.meta.url,
  ),
);

test("0033 fresh sweep migration defines event-scoped public rides RPC", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /create or replace function public\.public_event_rides\(/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public/i);
  assert.match(sql, /where e\.slug = p_slug/i);
  assert.match(sql, /grant execute on function public\.public_event_rides\(text, integer\) to anon, authenticated/i);
});

test("0033 public event counts aggregate rides directly not global cap RPC", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /create or replace function public\.public_upcoming_events\(\)/i);
  assert.match(sql, /create or replace function public\.public_event_board\(p_slug text\)/i);
  assert.match(sql, /from public\.rides r/i);
  assert.doesNotMatch(
    sql,
    /from public\.public_upcoming_rides\(null, null, null, 100, null\)/i,
  );
});

test("0033 fresh sweep migration narrows table grants and asserts contract", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /revoke all privileges on all tables in schema public from anon/i);
  assert.match(sql, /grant update \(read_at\) on table public\.messages to authenticated/i);
  assert.match(sql, /fresh sweep grant cleanup failed/i);
  assert.match(sql, /anon must execute public_event_rides/i);
});

test("0030 public events migration defines privacy-safe RPCs", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../supabase/migrations/0030_public_events.sql", import.meta.url)),
    "utf8",
  );

  assert.match(sql, /create or replace function public\.public_upcoming_events\(\)/i);
  assert.match(sql, /create or replace function public\.public_event_board\(p_slug text\)/i);
  assert.match(sql, /security definer\s+set search_path = public/i);
  assert.match(sql, /coalesce\(e\.end_date, e\.start_date\) >= current_date/i);
  assert.doesNotMatch(sql, /from public\.ride_requests/i);
  assert.doesNotMatch(sql, /rider_id|requested_by|driver_id/i);
});

test("0030 public events migration grants only RPC execution to anon", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../supabase/migrations/0030_public_events.sql", import.meta.url)),
    "utf8",
  );

  assert.match(sql, /revoke all on function public\.public_upcoming_events\(\) from public/i);
  assert.match(sql, /revoke all on function public\.public_event_board\(text\) from public/i);
  assert.match(sql, /grant execute on function public\.public_upcoming_events\(\) to anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.public_event_board\(text\) to anon, authenticated/i);
  assert.doesNotMatch(sql, /grant select on (table )?public\.events to anon/i);
  assert.doesNotMatch(sql, /grant select on (table )?public\.ride_requests to anon/i);
});

test("public source URL migration appends the nullable RPC field compatibly", () => {
  const sql = readFileSync(publicSourceUrlMigrationPath, "utf8");

  assert.match(sql, /drop function public\.public_upcoming_events\(\)/i);
  assert.match(sql, /drop function public\.public_event_board\(text\)/i);
  assert.match(
    sql,
    /seats_available bigint,\s*source_url text\s*\)/i,
  );
  assert.match(
    sql,
    /coalesce\(counts\.seats_available,\s*0\)::bigint as seats_available,\s*e\.source_url/i,
  );
  assert.match(sql, /where e\.is_active = true/i);
  assert.match(
    sql,
    /coalesce\(e\.end_date,\s*e\.start_date\) >= current_date/i,
  );
});

test("public source URL migration preserves old caller grants", () => {
  const sql = readFileSync(publicSourceUrlMigrationPath, "utf8");

  assert.match(
    sql,
    /grant execute on function public\.public_upcoming_events\(\)\s*to anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.public_event_board\(text\)\s*to anon, authenticated, service_role/i,
  );
});

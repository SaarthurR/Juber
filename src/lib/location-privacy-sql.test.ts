import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration34 = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/0034_ride_passenger_guests.sql", import.meta.url)),
  "utf8",
);
const migration35 = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/0035_ride_location_privacy_expand.sql", import.meta.url)),
  "utf8",
);
const migration36 = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/0036_ride_passenger_pickup_private.sql", import.meta.url)),
  "utf8",
);
const pendingReloadMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/20260712050546_pending_rider_pickup_reload.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const task16 = readFileSync(
  fileURLToPath(new URL("../../supabase/tests/task_16_location_privacy.sql", import.meta.url)),
  "utf8",
);
const addressZeroDowntimeMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/20260712152333_address_zero_downtime.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const task23 = readFileSync(
  fileURLToPath(new URL("../../supabase/tests/task_23_address_zero_downtime.sql", import.meta.url)),
  "utf8",
);
const addressTriggerHardeningMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/20260712153835_address_trigger_hardening.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const task24 = readFileSync(
  fileURLToPath(
    new URL("../../supabase/tests/task_24_address_trigger_hardening.sql", import.meta.url),
  ),
  "utf8",
);
const coarseLabelPermissionFix = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/20260712181946_fix_coarse_label_trigger_permissions.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

test("0034 adds guest_count and swaps seat math to sum(1+guest_count)", () => {
  assert.match(migration34, /guest_count int not null default 0/i);
  assert.match(migration34, /check \(guest_count between 0 and 4\)/i);
  assert.match(migration34, /coalesce\(sum\(1 \+ guest_count\), 0\)/i);
  assert.match(migration34, /drop function if exists public\.request_seat\(uuid\)/i);
  assert.match(migration34, /p_guest_count int default 0/i);
});

test("0035 closes anon exact-location exposure and adds gated meetup RPC", () => {
  assert.match(migration35, /pickup_note text/i);
  assert.match(migration35, /home_address text/i);
  assert.match(migration35, /create or replace function public\.ride_meetup_location\(/i);
  assert.match(migration35, /drop function if exists public\.public_upcoming_rides/i);
  assert.match(migration35, /drop function if exists public\.public_event_rides/i);

  const upcoming = migration35.slice(
    migration35.indexOf("create or replace function public.public_upcoming_rides"),
    migration35.indexOf("drop function if exists public.public_event_rides"),
  );
  const eventRides = migration35.slice(
    migration35.indexOf("create or replace function public.public_event_rides"),
    migration35.indexOf("revoke execute on function public.request_seat"),
  );

  assert.doesNotMatch(upcoming, /pickup_location/);
  assert.doesNotMatch(upcoming, /dropoff_location/);
  assert.doesNotMatch(eventRides, /pickup_location/);
  assert.doesNotMatch(eventRides, /dropoff_location/);
  assert.doesNotMatch(migration35, /revoke select \(pickup_location, dropoff_location\) on public\.rides/i);
});

test("0035 keeps home address self-only and extends request_seat backward-compatibly", () => {
  assert.match(migration35, /revoke select on table public\.profile_contacts from authenticated/i);
  assert.match(migration35, /grant select \(user_id, phone, whatsapp, updated_at\)/i);
  assert.match(migration35, /create or replace function public\.get_home_address\(/i);
  assert.match(migration35, /p_pickup_note text default null/i);
  assert.match(migration35, /grant execute on function public\.ride_meetup_location\(uuid\) to authenticated/i);
  assert.match(migration35, /home_address must not be directly selectable by authenticated/i);
});

test("0036 moves pickup_note to private side table and strips anon free-text notes", () => {
  assert.match(migration36, /create table public\.ride_passenger_pickup_notes/i);
  assert.match(migration36, /revoke all on table public\.ride_passenger_pickup_notes from anon, authenticated/i);
  assert.match(migration36, /drop column if exists pickup_note/i);
  assert.match(migration36, /left join public\.ride_passenger_pickup_notes pn/i);
  assert.match(migration36, /rp\.status in \('pending', 'confirmed'\)/i);
  assert.match(migration36, /null::text as return_notes/i);
  assert.match(migration36, /null::text as notes/i);
  assert.match(migration36, /authenticated must not directly select pickup notes table/i);
  assert.doesNotMatch(migration36, /insert into public\.ride_passengers[^;]*pickup_note/i);
});

test("pending pickup reload preserves gating, ban guard, and grants", () => {
  assert.match(
    pendingReloadMigration,
    /create or replace function public\.ride_meetup_location\(p_ride_id uuid\)/i,
  );
  assert.match(pendingReloadMigration, /language plpgsql/i);
  assert.match(pendingReloadMigration, /security definer/i);
  assert.match(pendingReloadMigration, /stable/i);
  assert.match(pendingReloadMigration, /set search_path = public/i);
  assert.match(pendingReloadMigration, /public\.is_banned\(auth\.uid\(\)\)/i);
  assert.match(pendingReloadMigration, /self_rp\.status = 'pending'/i);
  assert.match(pendingReloadMigration, /rp\.passenger_id = auth\.uid\(\)/i);
  assert.match(
    pendingReloadMigration,
    /rp\.status = 'confirmed'\s+and public\.shares_booking\(r\.driver_id\)/i,
  );
  assert.match(
    pendingReloadMigration,
    /revoke execute on function public\.ride_meetup_location\(uuid\) from public, anon/i,
  );
  assert.match(
    pendingReloadMigration,
    /grant execute on function public\.ride_meetup_location\(uuid\) to authenticated/i,
  );
  assert.doesNotMatch(
    pendingReloadMigration,
    /revoke select \(pickup_location, dropoff_location\) on public\.rides/i,
  );
});

test("address zero-downtime migration closes exact meetup exposure without column revoke", () => {
  assert.match(addressZeroDowntimeMigration, /create table public\.ride_meetup_locations/i);
  assert.match(
    addressZeroDowntimeMigration,
    /deferrable initially deferred/i,
  );
  assert.match(
    addressZeroDowntimeMigration,
    /revoke all on table public\.ride_meetup_locations from anon, authenticated/i,
  );
  assert.match(addressZeroDowntimeMigration, /create or replace function public\.divert_ride_meetup\(/i);
  assert.match(addressZeroDowntimeMigration, /revoke all on function public\.divert_ride_meetup\(\)/i);
  assert.match(addressZeroDowntimeMigration, /create trigger rides_divert_meetup/i);
  assert.match(addressZeroDowntimeMigration, /left join public\.ride_meetup_locations m/i);
  assert.match(addressZeroDowntimeMigration, /coalesce\(m\.pickup_location, r\.pickup_location\)/i);
  assert.match(addressZeroDowntimeMigration, /public\.is_banned\(auth\.uid\(\)\)/i);
  assert.match(addressZeroDowntimeMigration, /self_rp\.status = 'pending'/i);
  assert.match(addressZeroDowntimeMigration, /authenticated must not directly select ride_meetup_locations/i);
  assert.doesNotMatch(
    addressZeroDowntimeMigration,
    /revoke select \(pickup_location, dropoff_location\) on public\.rides/i,
  );
  assert.doesNotMatch(addressZeroDowntimeMigration, /drop column.*pickup_location/i);
});

test("task23 exercises zero-downtime address closure contracts", () => {
  assert.match(task23, /unrelated authenticated direct select returns coarse only/i);
  assert.match(task23, /unrelated authenticated select star still succeeds/i);
  assert.match(task23, /driver insert with exact meetup succeeds/i);
  assert.match(task23, /unrelated update does not clobber side-table exact/i);
  assert.match(task23, /exact meetup update refreshes side table/i);
  assert.match(task23, /delete rides cascades side-table row/i);
  assert.match(task23, /rollback removes side-table exact row/i);
  assert.match(task23, /request_seat still locks ride row for booking/i);
  assert.match(task23, /banned user denied ride_meetup_location RPC/i);
  assert.match(task23, /ride_meetup_locations side table not selectable by authenticated/i);
});

test("address trigger hardening migration closes C2/I1/I2 regressions", () => {
  assert.match(addressTriggerHardeningMigration, /drop trigger if exists rides_divert_meetup/i);
  assert.match(addressTriggerHardeningMigration, /create trigger rides_capture_meetup/i);
  assert.match(addressTriggerHardeningMigration, /after insert or update on public\.rides/i);
  assert.match(addressTriggerHardeningMigration, /pg_trigger_depth\(\) > 1/i);
  assert.match(addressTriggerHardeningMigration, /create or replace function public\.assert_coarse_label/i);
  assert.match(addressTriggerHardeningMigration, /rides_enforce_coarse_labels/i);
  assert.match(addressTriggerHardeningMigration, /ride_requests_enforce_coarse_labels/i);
  assert.match(addressTriggerHardeningMigration, /case\s+when v_pickup_set then excluded\.pickup_location/i);
  assert.match(addressTriggerHardeningMigration, /authenticated must execute request_seat/i);
  assert.doesNotMatch(addressTriggerHardeningMigration, /create trigger rides_divert_meetup/i);
});

test("coarse-label trigger wrappers execute as their owner", () => {
  assert.match(
    coarseLabelPermissionFix,
    /alter function public\.enforce_ride_coarse_labels\(\)\s+security definer/i,
  );
  assert.match(
    coarseLabelPermissionFix,
    /alter function public\.enforce_request_coarse_labels\(\)\s+security definer/i,
  );
  assert.match(
    coarseLabelPermissionFix,
    /revoke all on function public\.assert_coarse_label\(text\)\s+from public, anon, authenticated/i,
  );
});

test("task24 exercises duplicate-ignore exploit closure and label enforcement", () => {
  assert.match(task24, /duplicate-ignore leaves victim side row byte-identical/i);
  assert.match(task24, /conflict update blocked by rides_update_own/i);
  assert.match(task24, /partial update refreshes pickup and preserves dropoff sibling/i);
  assert.match(task24, /clear pickup nulls side pickup/i);
  assert.match(task24, /coarse-resubmit preserves stored exact/i);
  assert.match(task24, /malicious ride label rejected/i);
  assert.match(task24, /preset place label insert succeeds/i);
  assert.match(task24, /scrub-only meetup update emits no cancellation notification/i);
  assert.match(task24, /request_seat locking contract preserved/i);
  assert.match(task24, /rollback removes side-table exact row/i);
});

test("task16 exercises confirmation-time party capacity atomically", () => {
  assert.match(task16, /pending passenger reloads only own pickup snapshot/i);
  assert.match(task16, /bool_and\(pickup_location is null\)/i);
  assert.match(task16, /unrelated cannot read another passenger pickup via gated RPC/i);
  assert.match(task16, /banned pending passenger is denied meetup RPC/i);
  assert.match(task16, /public\.request_seat\(:'race_ride', 1\) = 'requested'/i);
  assert.match(task16, /public\.request_seat\(:'race_ride', 0\) = 'requested'/i);
  assert.match(task16, /sum\(1 \+ guest_count\) = 3/i);
  assert.match(task16, /public\.confirm_passenger\(:'other', :'race_ride'\)/i);
  assert.match(task16, /later confirmation that would oversell is rejected/i);
  assert.match(task16, /oversell rejection leaves booking and seat state unchanged/i);
  assert.match(task16, /cancellation restores the full party of 2/i);
  assert.match(task16, /race scenario leaves no stale active booking state/i);
  assert.doesNotMatch(task16, /second party of 2 would oversell 2-seat ride/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isRateLimitError,
  mapInsertError,
  mapRateLimitError,
} from "@/lib/rate-limit";

test("isRateLimitError matches JB429 only", () => {
  assert.equal(isRateLimitError({ code: "JB429" }), true);
  assert.equal(isRateLimitError({ code: "23505" }), false);
  assert.equal(isRateLimitError(null), false);
});

test("mapRateLimitError maps scopes and retry hints", () => {
  const burst = mapRateLimitError({
    code: "JB429",
    details: "scope=message_burst",
    hint: "retry_after_seconds=12",
  });
  assert.match(burst!, /sending messages too fast/i);
  assert.match(burst!, /12 seconds/i);

  const hour = mapRateLimitError({
    code: "JB429",
    details: "scope=ride_day",
    hint: "retry_after_seconds=7200",
  });
  assert.match(hour!, /daily ride posting limit/i);
  assert.match(hour!, /2 hours/i);

  const request = mapRateLimitError({
    code: "JB429",
    details: "scope=request_burst",
    hint: "retry_after_seconds=90",
  });
  assert.match(request!, /too many requests recently/i);
  assert.match(request!, /2 minutes/i);
});

test("mapRateLimitError returns null for non-rate-limit errors", () => {
  assert.equal(mapRateLimitError({ code: "42501", message: "denied" }), null);
});

test("mapInsertError prefers rate-limit mapping", () => {
  const mapped = mapInsertError(
    { code: "JB429", details: "scope=message_hour", hint: "retry_after_seconds=300" },
    "Could not send this message. Please try again.",
  );
  assert.match(mapped, /too many messages this hour/i);
});

test("sendMessage, postRide, postRequest, and mobile request wire rate-limit mapper", () => {
  for (const file of [
    "src/app/messages/actions.ts",
    "src/app/rides/actions.ts",
    "src/app/m/actions.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /mapRateLimitError|mapInsertError/);
    assert.doesNotMatch(source, /error boundary/i);
  }
});

test("task 25 uses the exact burst boundary and captures the losing race", () => {
  const source = readFileSync("supabase/tests/task_25_anti_spam.sql", "utf8");
  const race = source.slice(source.indexOf("task25_cleanup_race_links"));
  assert.match(source, /from generate_series\(1, 30\) g;/);
  assert.equal((race.match(/dblink_exec\('task25_race_[ab]', 'begin'\)/g) ?? []).length, 2);
  assert.equal(
    (race.match(/dblink_exec\('task25_race_[ab]', 'set local role authenticated'\)/g) ?? [])
      .length,
    2,
  );
  assert.equal((race.match(/set local request\.jwt\.claim\.sub = %L/g) ?? []).length, 2);
  assert.doesNotMatch(race, /select set_config\('request\.jwt\.claim\.sub'/);
  assert.match(race, /select auth\.uid\(\)/);
  assert.match(race, /select public\.task25_capture_sqlstate\(/);
  assert.match(race, /dblink_exec\('task25_race_a', 'commit'\)/);
  assert.match(race, /when others then\s+perform pg_temp\.task25_cleanup_race_links\(\);\s+raise;/);
  assert.match(race, /dblink_exec\(v_connection, 'rollback'\)/);
  assert.match(race, /dblink_disconnect\(v_connection\)/);
  assert.match(race, /result ->> 'winner' = 'INSERT 0 1'/);
  assert.match(race, /result ->> 'loser' = 'JB429'/);
  assert.match(race, /'concurrent boundary leaves no extra row'/);
  assert.match(race, /'concurrent race rolls back and disconnects both links'/);
});

test("timestamp bypass migration orders system, user, and admin behavior", () => {
  const source = readFileSync(
    "supabase/migrations/20260712161647_anti_spam_timestamp_bypass.sql",
    "utf8",
  );
  for (const name of [
    "enforce_message_rate",
    "enforce_ride_rate",
    "enforce_request_rate",
  ]) {
    const start = source.indexOf(`function public.${name}()`);
    const end = source.indexOf("$$;", start);
    const body = source.slice(start, end);
    const bypass = body.indexOf("if v_uid is null or v_uid is distinct from new.");
    const timestamp = body.indexOf("new.created_at := now()");
    const admin = body.indexOf("if public.is_admin()");
    assert.ok(start >= 0 && bypass >= 0);
    assert.ok(bypass < timestamp);
    assert.ok(timestamp < admin);
  }
});

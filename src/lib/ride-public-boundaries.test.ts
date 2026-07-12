import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("anonymous ride boards use nullable dates and skip private request queries", () => {
  const desktop = read("src/app/(desktop)/rides/page.tsx");
  const mobile = read("src/app/m/page.tsx");
  const profile = read("src/app/(desktop)/profile/[id]/page.tsx");
  const ridesView = read("src/components/rides-view.tsx");

  assert.match(desktop, /p_date: date \|\| null/);
  assert.match(mobile, /parseDateOnly\(requestedDate\)/);
  assert.match(mobile, /redirect\(`\/m/);
  assert.match(desktop, /if \(tab\) clean\.set\("tab", tab\)/);
  assert.match(
    desktop,
    /const requestsQuery = user[\s\S]+Promise\.resolve\(\{ data: \[\], error: null \}\)/,
  );
  assert.match(
    mobile,
    /const requestsQuery = user[\s\S]+Promise\.resolve\(\{ data: \[\], error: null \}\)/,
  );
  assert.match(
    desktop,
    /user\s*\? supabase\s*\.from\("ride_requests"\)\s*\.select\("id", \{ count: "exact", head: true \}\)/,
  );
  assert.match(profile, /if \(user && tab === "requests"\)/);
  assert.ok(
    profile.indexOf('if (!user && tab === "requests")') <
      profile.indexOf("await createClient()"),
  );
  assert.match(
    ridesView,
    /kind === "requests" && !signedIn\s*\? "Sign in to view ride requests"\s*: hasFilters/,
  );
});

test("request-only routes authenticate before creating a database client", () => {
  for (const path of [
    "src/app/m/requests/page.tsx",
    "src/app/(desktop)/requests/[id]/page.tsx",
    "src/app/m/requests/[id]/page.tsx",
  ]) {
    const source = read(path);
    assert.ok(
      source.indexOf("if (!user)") < source.indexOf("await createClient()"),
    );
    assert.match(source, /Sign in to view ride requests/);
  }
});

test("successful seat cancellation closes and resets before navigation", () => {
  const source = read("src/components/ride-actions.tsx");
  const start = source.indexOf("export function CancelSeatButton");
  const success = source.indexOf("setOpen(false);", start);
  const navigation = source.indexOf("router.push", success);

  assert.ok(success > start);
  assert.ok(success < navigation);
  assert.ok(source.indexOf('setMessage("");', success) < navigation);
  assert.ok(source.indexOf("setError(null);", success) < navigation);
});

test("ride reads fail visibly and both shells expose retry boundaries", () => {
  const desktop = read("src/app/(desktop)/rides/page.tsx");
  assert.match(desktop, /parseDateOnly\(requestedDate\)/);
  assert.ok(
    desktop.indexOf("redirect(`/rides") <
      desktop.indexOf("await createClient()"),
  );
  assert.match(desktop, /throwReadError\(ridesResult\.error/);
  assert.match(desktop, /throwReadError\(requestsResult\.error/);
  assert.match(desktop, /throwReadError\(countResult\.error/);
  for (const path of ["src/app/(desktop)/error.tsx", "src/app/m/error.tsx"]) {
    const source = read(path);
    assert.match(source, /unstable_retry/);
    assert.match(source, /Try again/);
    assert.match(source, /role="alert"/);
  }
  for (const path of [
    "src/app/(desktop)/page.tsx",
    "src/app/m/profile/page.tsx",
    "src/app/m/profile/[id]/page.tsx",
  ]) {
    assert.match(read(path), /throwReadError\(/);
  }
});

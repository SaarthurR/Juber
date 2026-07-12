import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const eventsPage = fileURLToPath(new URL("../app/(desktop)/events/page.tsx", import.meta.url));
const detailPage = fileURLToPath(new URL("../app/(desktop)/events/[slug]/page.tsx", import.meta.url));

test("events page removes fake demand and has first-mover copy", () => {
  const source = readFileSync(eventsPage, "utf8");

  assert.doesNotMatch(source, /HIGH DEMAND/);
  assert.match(source, /Be the first to offer a ride/);
  assert.match(source, /ride board/);
});

test("event detail uses ride-board terminology", () => {
  const source = readFileSync(detailPage, "utf8");

  assert.doesNotMatch(source, />Carpools</);
  assert.match(source, />Ride board</);
});

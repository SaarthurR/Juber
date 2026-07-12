import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  COARSE_LABEL_HINT,
  mapCoarseLabelDbError,
  validateCoarseLabel,
} from "@/lib/coarse-label";

const presets = new Set(["JCNC", "Jain Center of Northern California", "San Jose"]);

test("coarse label validator accepts city and preset place names", () => {
  assert.equal(validateCoarseLabel("San Jose", presets), null);
  assert.equal(validateCoarseLabel("JCNC", presets), null);
  assert.equal(validateCoarseLabel("Little India", presets), null);
  assert.equal(validateCoarseLabel("Jain Center of Northern California", presets), null);
});

test("coarse label validator rejects street-style labels", () => {
  assert.equal(validateCoarseLabel("777 Exact Pickup Blvd", presets), COARSE_LABEL_HINT);
  assert.equal(validateCoarseLabel("95111", presets), COARSE_LABEL_HINT);
  assert.equal(validateCoarseLabel("Apt 4", presets), COARSE_LABEL_HINT);
  assert.equal(validateCoarseLabel("PO Box 12", presets), COARSE_LABEL_HINT);
});

test("mapCoarseLabelDbError surfaces actionable copy for DB violations", () => {
  assert.equal(mapCoarseLabelDbError("coarse_label_has_digits"), COARSE_LABEL_HINT);
  assert.equal(mapCoarseLabelDbError("other error"), "other error");
});

test("ride and request actions validate coarse labels before insert", () => {
  const rides = readFileSync("src/app/rides/actions.ts", "utf8");
  const mobile = readFileSync("src/app/m/actions.ts", "utf8");
  for (const source of [rides, mobile]) {
    assert.match(source, /validateCoarseLabel/);
    assert.match(source, /mapCoarseLabelDbError/);
    assert.match(source, /assertCoarseLabels/);
    assert.match(source, /activePlaceNames/);
  }
});

test("ride and request forms surface city-neighborhood hints", () => {
  const rideForm = readFileSync("src/components/new-ride-form.tsx", "utf8");
  const requestForm = readFileSync("src/components/request-form.tsx", "utf8");
  assert.match(rideForm, /city or neighborhood/i);
  assert.match(rideForm, /not a street address/i);
  assert.match(requestForm, /city or neighborhood/i);
  assert.match(requestForm, /not a street address/i);
});

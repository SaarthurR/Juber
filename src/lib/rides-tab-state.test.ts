import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createRidesTabHref,
  getRidesTabFromSearch,
  ridesTabReducer,
} from "./rides-tab-state";

const ridesView = readFileSync(new URL("../components/rides-view.tsx", import.meta.url), "utf8");

test("rides tab reducer changes visible tab immediately on click", () => {
  const state = ridesTabReducer(
    { visibleTab: "carpools" },
    { type: "select", tab: "requests" },
  );

  assert.deepEqual(state, { visibleTab: "requests" });
});

test("rides tab reducer syncs visible tab from browser history", () => {
  const state = ridesTabReducer(
    { visibleTab: "requests" },
    { type: "sync", search: "?from=Fremont" },
  );

  assert.deepEqual(state, { visibleTab: "carpools" });
});

test("rides tab URL helper writes canonical requests and carpools URLs", () => {
  assert.equal(
    createRidesTabHref("/rides", "?from=Fremont&tab=requests", "carpools"),
    "/rides?from=Fremont",
  );
  assert.equal(
    createRidesTabHref("/rides", "?from=Fremont", "requests"),
    "/rides?from=Fremont&tab=requests",
  );
});

test("rides tab parser treats only tab=requests as the requests panel", () => {
  assert.equal(getRidesTabFromSearch("?tab=requests"), "requests");
  assert.equal(getRidesTabFromSearch("?tab=carpools"), "carpools");
  assert.equal(getRidesTabFromSearch(""), "carpools");
});

test("RidesView wires tab controls to aria state and browser history sync", () => {
  assert.match(ridesView, /role="tab"/);
  assert.match(ridesView, /aria-selected=\{active\}/);
  assert.match(ridesView, /aria-controls=\{controls\}/);
  assert.match(ridesView, /role="tabpanel"/);
  assert.match(ridesView, /window\.history\.pushState/);
  assert.match(ridesView, /addEventListener\("popstate"/);
});

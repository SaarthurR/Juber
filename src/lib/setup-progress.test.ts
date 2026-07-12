import test from "node:test";
import assert from "node:assert/strict";
import { buildSetupProgress } from "./setup-progress";

test("buildSetupProgress counts essentials without optional fields", () => {
  const progress = buildSetupProgress({
    fullName: "Ada Lovelace",
    avatarUrl: "https://example.com/a.png",
    phone: null,
    whatsapp: null,
    homeAddress: null,
    carMakeModel: null,
  });

  assert.equal(progress.essentialsDone, 2);
  assert.equal(progress.essentialsTotal, 3);
  assert.equal(progress.essentialsComplete, false);
  assert.match(progress.summary, /2 of 3 essentials done/);
  assert.equal(
    progress.items.find((item) => item.id === "home")?.done,
    false,
  );
});

test("buildSetupProgress marks essentials complete when contact is present", () => {
  const progress = buildSetupProgress({
    fullName: "Ada Lovelace",
    avatarUrl: "https://example.com/a.png",
    phone: "555-0100",
    whatsapp: null,
    homeAddress: "123 Main St",
    carMakeModel: "Toyota Sienna",
  });

  assert.equal(progress.essentialsDone, 3);
  assert.equal(progress.essentialsComplete, true);
  assert.equal(progress.items.find((item) => item.id === "home")?.done, true);
  assert.equal(progress.items.find((item) => item.id === "vehicle")?.done, true);
});

test("buildSetupProgress does not claim completion when only optional fields are set", () => {
  const progress = buildSetupProgress({
    fullName: "",
    avatarUrl: null,
    phone: null,
    whatsapp: null,
    homeAddress: "123 Main St",
    carMakeModel: "Honda Civic",
  });

  assert.equal(progress.essentialsDone, 0);
  assert.equal(progress.essentialsComplete, false);
});

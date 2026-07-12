import test from "node:test";
import assert from "node:assert/strict";
import {
  contactStepCanAdvance,
  optionalStepCanSkip,
} from "@/lib/onboarding-wizard";

test("contact step cannot advance when both phone and whatsapp are empty", () => {
  assert.equal(contactStepCanAdvance("", ""), false);
  assert.equal(contactStepCanAdvance("  ", "  "), false);
});

test("contact step can advance when phone or whatsapp is present", () => {
  assert.equal(contactStepCanAdvance("555-0100", ""), true);
  assert.equal(contactStepCanAdvance("", "+1 555 555 5555"), true);
  assert.equal(contactStepCanAdvance(" 555-0100 ", " "), true);
});

test("optional steps allow skip only when marked optional", () => {
  assert.equal(optionalStepCanSkip(true), true);
  assert.equal(optionalStepCanSkip(false), false);
  assert.equal(optionalStepCanSkip(undefined), false);
});

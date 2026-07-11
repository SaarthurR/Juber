import test from "node:test";
import assert from "node:assert/strict";
import { redirect } from "next/navigation";
import { actionErrorMessage, canReserveRide, deferBestEffort } from "./action-lifecycle";

test("actionErrorMessage rethrows Next redirect control flow", () => {
  let redirectError: unknown;

  try {
    redirect("/m");
  } catch (error) {
    redirectError = error;
  }

  assert.throws(
    () => actionErrorMessage(redirectError, "Fallback"),
    (error) => error === redirectError,
  );
});

test("actionErrorMessage preserves real action errors", () => {
  assert.equal(actionErrorMessage(new Error("Action failed"), "Fallback"), "Action failed");
  assert.equal(actionErrorMessage(null, "Fallback"), "Fallback");
});

test("deferBestEffort starts work only from the scheduled callback", async () => {
  let scheduled: (() => Promise<void>) | undefined;
  let started = false;

  deferBestEffort(
    (task) => {
      scheduled = task;
    },
    async () => {
      started = true;
    },
    () => undefined,
  );

  assert.equal(started, false);
  assert.ok(scheduled);
  await scheduled();
  assert.equal(started, true);
});

test("deferBestEffort logs rejection without rejecting the callback", async () => {
  let scheduled: (() => Promise<void>) | undefined;
  const logged: unknown[] = [];

  deferBestEffort(
    (task) => {
      scheduled = task;
    },
    async () => {
      throw new Error("SMS unavailable");
    },
    (error) => {
      logged.push(error);
    },
  );

  assert.ok(scheduled);
  await scheduled();
  assert.equal(logged.length, 1);
  assert.match(String(logged[0]), /SMS unavailable/);
});

test("canReserveRide allows only active unjoined rides with capacity", () => {
  assert.equal(canReserveRide("active", false, 1), true);
  assert.equal(canReserveRide("completed", false, 1), false);
  assert.equal(canReserveRide("cancelled", false, 1), false);
  assert.equal(canReserveRide("active", true, 1), false);
  assert.equal(canReserveRide("active", false, 0), false);
});

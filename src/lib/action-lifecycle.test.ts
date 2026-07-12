import test from "node:test";
import assert from "node:assert/strict";
import { redirect } from "next/navigation";
import {
  actionErrorMessage,
  canReserveRide,
  deferBestEffort,
  emptyRideCancellationReason,
} from "./action-lifecycle";

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

test("canReserveRide matches request_seat passenger status semantics", () => {
  assert.equal(canReserveRide("active", null, 1), true);
  assert.equal(canReserveRide("active", "declined", 1), true);
  assert.equal(canReserveRide("active", "cancelled", 1), true);
  assert.equal(canReserveRide("active", "pending", 1), false);
  assert.equal(canReserveRide("active", "confirmed", 1), false);
  assert.equal(canReserveRide("completed", "declined", 1), false);
  assert.equal(canReserveRide("cancelled", "cancelled", 1), false);
  assert.equal(canReserveRide("active", "declined", 0), false);
});

test("empty cancellation reason is compatible only with a fresh empty roster", () => {
  assert.equal(
    emptyRideCancellationReason(3, 3),
    "Ride cancelled before anyone joined.",
  );
  assert.equal(emptyRideCancellationReason(3, 2), null);
  assert.equal(emptyRideCancellationReason(3, 0), null);
});

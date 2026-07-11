import test from "node:test";
import assert from "node:assert/strict";
import { pendingActionReducer } from "./pending-action-button";

test("pendingActionReducer locks on the first submitted key", () => {
  const state = pendingActionReducer({ pendingKey: null }, { type: "start", key: "confirm" });

  assert.deepEqual(state, { pendingKey: "confirm" });
});

test("pendingActionReducer ignores competing starts while locked", () => {
  const state = pendingActionReducer({ pendingKey: "confirm" }, { type: "start", key: "decline" });

  assert.deepEqual(state, { pendingKey: "confirm" });
});

test("pendingActionReducer releases only the active key", () => {
  const stillLocked = pendingActionReducer(
    { pendingKey: "confirm" },
    { type: "finish", key: "decline" },
  );
  const released = pendingActionReducer(
    { pendingKey: "confirm" },
    { type: "finish", key: "confirm" },
  );

  assert.deepEqual(stillLocked, { pendingKey: "confirm" });
  assert.deepEqual(released, { pendingKey: null });
});

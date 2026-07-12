import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_ACTION_INITIAL,
  adminActionError,
  adminActionInfo,
  adminActionSuccess,
} from "./admin-action-state";

test("adminActionSuccess increments resetKey for form resets", () => {
  assert.deepEqual(adminActionSuccess("Event added.", ADMIN_ACTION_INITIAL), {
    status: "success",
    message: "Event added.",
    resetKey: 1,
  });
});

test("adminActionError and adminActionInfo stay visible without reset", () => {
  assert.deepEqual(adminActionError("Delete failed."), {
    status: "error",
    message: "Delete failed.",
    resetKey: 0,
  });
  assert.deepEqual(adminActionInfo("Request was already approved."), {
    status: "info",
    message: "Request was already approved.",
    resetKey: 0,
  });
});

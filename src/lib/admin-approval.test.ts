import test from "node:test";
import assert from "node:assert/strict";
import {
  isApproveEventRequestV2Result,
  isRejectEventRequestV2Result,
  interpretRejectEventRequest,
  rejectOutcomeToAdminState,
  rejectV2OutcomeToAdminState,
} from "./admin-approval";

test("reject v2 result guard accepts the exact RPC outcomes", () => {
  for (const outcome of [
    "rejected",
    "already_rejected",
    "already_approved",
    "missing",
  ]) {
    assert.equal(
      isRejectEventRequestV2Result({
        outcome,
        event_id: outcome === "already_approved" ? "event-1" : null,
      }),
      true,
    );
  }
});

test("reject v2 outcome helper preserves reset semantics", () => {
  assert.deepEqual(rejectV2OutcomeToAdminState("rejected", { resetKey: 2 }), {
    status: "success",
    message: "Request rejected.",
    resetKey: 3,
  });
});

test("approve v2 result guard accepts the exact RPC outcomes", () => {
  for (const outcome of [
    "approved",
    "already_approved",
    "already_rejected",
    "missing",
  ]) {
    assert.equal(
      isApproveEventRequestV2Result({
        outcome,
        event_id: outcome.includes("approved") ? "event-1" : null,
      }),
      true,
    );
  }
});

test("approve v2 result guard rejects malformed payloads", () => {
  assert.equal(isApproveEventRequestV2Result(null), false);
  assert.equal(
    isApproveEventRequestV2Result({
      outcome: "pending",
      event_id: null,
    }),
    false,
  );
  assert.equal(
    isApproveEventRequestV2Result({
      outcome: "approved",
      event_id: 1,
    }),
    false,
  );
});

test("interpretRejectEventRequest maps pending rejections and stale outcomes", () => {
  assert.deepEqual(
    interpretRejectEventRequest({
      beforeStatus: "pending",
      updated: true,
      afterStatus: "rejected",
      updateError: null,
    }),
    { kind: "rejected", message: "Request rejected." },
  );

  assert.deepEqual(
    interpretRejectEventRequest({
      beforeStatus: "approved",
      updated: false,
      afterStatus: "approved",
      updateError: null,
    }),
    { kind: "already_approved", message: "Request was already approved." },
  );

  assert.deepEqual(
    interpretRejectEventRequest({
      beforeStatus: "rejected",
      updated: false,
      afterStatus: "rejected",
      updateError: null,
    }),
    { kind: "already_rejected", message: "Request was already rejected." },
  );
});

test("reject outcome helper preserves reset semantics", () => {
  assert.deepEqual(
    rejectOutcomeToAdminState(
      { kind: "already_rejected", message: "Request was already rejected." },
      { resetKey: 2 },
    ),
    { status: "info", message: "Request was already rejected.", resetKey: 0 },
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  approveOutcomeToAdminState,
  interpretApproveEventRequest,
  interpretRejectEventRequest,
  rejectOutcomeToAdminState,
} from "./admin-approval";

test("interpretApproveEventRequest maps fresh approval to success", () => {
  assert.deepEqual(
    interpretApproveEventRequest({
      beforeStatus: "pending",
      rpcEventId: "event-1",
      afterStatus: "approved",
      rpcError: null,
    }),
    { kind: "approved", message: "Event approved and published." },
  );
});

test("interpretApproveEventRequest maps stale approval to already approved", () => {
  assert.deepEqual(
    interpretApproveEventRequest({
      beforeStatus: "approved",
      rpcEventId: "event-1",
      afterStatus: "approved",
      rpcError: null,
    }),
    { kind: "already_approved", message: "Request was already approved." },
  );
});

test("interpretApproveEventRequest maps missing and rejected requests", () => {
  assert.deepEqual(
    interpretApproveEventRequest({
      beforeStatus: null,
      rpcEventId: null,
      afterStatus: null,
      rpcError: null,
    }),
    { kind: "missing", message: "Request not found." },
  );

  assert.deepEqual(
    interpretApproveEventRequest({
      beforeStatus: "rejected",
      rpcEventId: null,
      afterStatus: "rejected",
      rpcError: null,
    }),
    { kind: "rejected", message: "Request was already rejected." },
  );
});

test("interpretApproveEventRequest surfaces RPC errors", () => {
  assert.deepEqual(
    interpretApproveEventRequest({
      beforeStatus: "pending",
      rpcEventId: null,
      afterStatus: "pending",
      rpcError: "Only admins can approve event requests",
    }),
    { kind: "error", message: "Only admins can approve event requests" },
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

test("approve and reject outcome helpers preserve reset semantics", () => {
  assert.deepEqual(
    approveOutcomeToAdminState(
      { kind: "approved", message: "Event approved and published." },
      { resetKey: 2 },
    ),
    { status: "success", message: "Event approved and published.", resetKey: 3 },
  );

  assert.deepEqual(
    rejectOutcomeToAdminState(
      { kind: "already_rejected", message: "Request was already rejected." },
      { resetKey: 2 },
    ),
    { status: "info", message: "Request was already rejected.", resetKey: 0 },
  );
});

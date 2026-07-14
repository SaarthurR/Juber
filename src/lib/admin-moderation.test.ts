import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_DECISION_OPTIONS,
  ADMIN_REPORT_REASONS,
  adminCaseReference,
  adminDecisionOptions,
  adminDecisionErrorMessage,
  adminReportHref,
  parseAdminEvidence,
  parseAdminReportContext,
  parseAdminReportList,
} from "./admin-moderation";

const reportId = "123e4567-e89b-42d3-a456-426614174000";
const reporterId = "123e4567-e89b-42d3-a456-426614174001";
const reportedId = "123e4567-e89b-42d3-a456-426614174002";

test("report list parser keeps deterministic cursor and nested identities", () => {
  const parsed = parseAdminReportList({
    items: [{
      id: reportId,
      target_type: "message",
      reason: "harassment_abuse",
      status: "pending",
      verdict: null,
      verdict_version: 0,
      enforcement: null,
      ban_days: null,
      created_at: "2026-07-13T20:00:00.000Z",
      reporter: { id: reporterId, full_name: "Maya Levi" },
      reported: { id: reportedId, full_name: "Noam Cohen" },
    }],
    next_cursor: { created_at: "2026-07-13T20:00:00.000Z", id: reportId },
    total: 17,
  });

  assert.equal(parsed.total, 17);
  assert.equal(parsed.items[0]?.reporter_id, reporterId);
  assert.equal(parsed.items[0]?.target_user_id, reportedId);
  assert.deepEqual(parsed.nextCursor, {
    createdAt: "2026-07-13T20:00:00.000Z",
    id: reportId,
  });
});

test("case context marks the latest structured decision current", () => {
  const context = parseAdminReportContext({
    report: {
      id: reportId,
      reporter_id: reporterId,
      target_type: "user",
      target_id: reportedId,
      target_user_id: reportedId,
      reason: "spam_scam",
      status: "dismissed",
      verdict: "no_violation",
      verdict_version: 2,
      enforcement: "none",
      created_at: "2026-07-13T20:00:00.000Z",
    },
    reporter: { id: reporterId, full_name: "Maya Levi" },
    reported: { id: reportedId, full_name: "Noam Cohen" },
    retained_counts: {
      reporter: { made: { open: 1, closed: 2 }, received: { open: 0, closed: 1 } },
      reported: { made: { open: 0, closed: 0 }, received: { open: 1, closed: 3 } },
    },
    decision_history: [
      { id: "a3", action: "appeal_resolved", created_at: "2026-07-13T22:00:00.000Z", detail: { decision: "denied", internal_note: "Ban remains appropriate." }, actor: { full_name: "Admin Three" } },
      { id: "a2", action: "verdict_revised", created_at: "2026-07-13T21:00:00.000Z", detail: { after: { verdict: "no_violation" } }, actor: { full_name: "Admin Two" } },
      { id: "a1", action: "report_status", created_at: "2026-07-13T20:30:00.000Z", detail: { verdict: "inconclusive" }, actor: { full_name: "Admin One" } },
    ],
    can_revise: true,
    revision_block_reason: null,
  });

  assert.equal(context?.history[0]?.action, "appeal_resolved");
  assert.equal(context?.history[0]?.current, false);
  assert.equal(context?.history[1]?.current, true);
  assert.equal(context?.history[2]?.superseded, true);
  assert.equal(context?.retained_counts.reported?.received.closed, 3);
});

test("evidence parser requires an audited receipt for the exact report", () => {
  assert.equal(parseAdminEvidence({ evidence: { body: "text" } }), null);
  assert.deepEqual(parseAdminEvidence({
    receipt_id: "123e4567-e89b-42d3-a456-426614174003",
    report: { id: reportId, target_type: "message" },
    evidence: { body: "text", context: [] },
  }), {
    report_id: reportId,
    receipt_id: "123e4567-e89b-42d3-a456-426614174003",
    target_type: "message",
    snapshot: { body: "text", context: [] },
  });
  assert.deepEqual(parseAdminEvidence({
    report_id: reportId,
    receipt_id: "123e4567-e89b-42d3-a456-426614174003",
    target_type: "user",
    snapshot: { details: "Preserved demo context" },
  }), {
    report_id: reportId,
    receipt_id: "123e4567-e89b-42d3-a456-426614174003",
    target_type: "user",
    snapshot: { details: "Preserved demo context" },
  });
});

test("decision matrix and safe stale errors remain narrow", () => {
  assert.deepEqual(ADMIN_DECISION_OPTIONS.inconclusive, ["none"]);
  assert.deepEqual(ADMIN_DECISION_OPTIONS.no_violation, ["none", "warn_reporter"]);
  assert.deepEqual(adminDecisionOptions("violation", false), ["none"]);
  assert.deepEqual(adminDecisionOptions("no_violation", false), ["none", "warn_reporter"]);
  assert.match(adminDecisionErrorMessage("stale expected version"), /changed while/i);
  assert.deepEqual(ADMIN_REPORT_REASONS.slice(0, 2), [
    "Harassment or abuse",
    "Unsafe or reckless driving",
  ]);
});

test("canonical report URLs retain list mode and short references", () => {
  assert.equal(adminCaseReference(reportId), "123E4567");
  assert.equal(
    adminReportHref(reportId, { scope: "closed", reason: "spam_scam" }),
    `/admin/moderation?scope=closed&reason=spam_scam&report=${reportId}`,
  );
});

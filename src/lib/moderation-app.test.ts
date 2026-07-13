import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  bannedPagePath,
  bindModerationActionTarget,
  createModerationEvidenceState,
  isModerationAllowedPath,
  isModerationEvidenceReady,
  mapAppealSubmitError,
  mapReportSubmitError,
  moderationEvidenceReducer,
  parseModerationNotices,
  visibleModerationEvidence,
  type ModerationEvidence,
  type ReportRow,
} from "./moderation";

test("moderation notices parser handles ban and warnings", () => {
  const snapshot = parseModerationNotices({
    banned: true,
    ban: {
      reason: "Harassment",
      expires_at: null,
      created_at: "2026-07-11T00:00:00.000Z",
      ban_id: "ban-1",
    },
    has_pending_appeal: true,
    warnings: [{ id: "w1", note: "Please follow guidelines", created_at: "2026-07-10T00:00:00.000Z" }],
  });

  assert.equal(snapshot.banned, true);
  assert.equal(snapshot.ban?.reason, "Harassment");
  assert.equal(snapshot.hasPendingAppeal, true);
  assert.equal(snapshot.warnings.length, 1);
});

test("report and appeal errors map to user-safe copy", () => {
  assert.match(mapReportSubmitError("Report rate limit exceeded"), /too many reports/i);
  assert.match(mapAppealSubmitError("A pending appeal already exists"), /pending appeal/i);
});

test("ban gate paths stay minimal", () => {
  assert.equal(isModerationAllowedPath("/banned"), true);
  assert.equal(isModerationAllowedPath("/m/banned"), true);
  assert.equal(isModerationAllowedPath("/auth/signout"), true);
  assert.equal(isModerationAllowedPath("/rides"), false);
  assert.equal(bannedPagePath(true), "/m/banned");
});

test("moderation app routes and RPC wiring exist", () => {
  const files = [
    "../app/moderation/actions.ts",
    "../components/report-target-button.tsx",
    "../components/admin-moderation-panel.tsx",
    "../components/moderation-banned-gate.tsx",
    "../app/(desktop)/banned/page.tsx",
    "../app/m/banned/page.tsx",
    "../app/(desktop)/admin/moderation/page.tsx",
    "../app/m/admin/page.tsx",
    "../../supabase/migrations/20260712052009_moderation_notices.sql",
  ];

  for (const file of files) {
    assert.equal(existsSync(new URL(file, import.meta.url)), true, `${file} should exist`);
  }

  const actions = readFileSync(new URL("../app/moderation/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /rpc\("submit_report"/);
  assert.match(actions, /rpc\("submit_appeal"/);
  assert.match(actions, /rpc\("admin_report_evidence"/);
  assert.doesNotMatch(actions, /\.from\("messages"\)/);

  const migration = readFileSync(
    new URL("../../supabase/migrations/20260712052009_moderation_notices.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /get_moderation_notices/);
});

test("report surfaces are wired on shared ride/request/profile/chat pages", () => {
  const surfaces = [
    "../app/(desktop)/rides/[id]/page.tsx",
    "../app/m/rides/[id]/page.tsx",
    "../app/(desktop)/requests/[id]/page.tsx",
    "../app/m/requests/[id]/page.tsx",
    "../app/(desktop)/profile/[id]/page.tsx",
    "../app/m/profile/[id]/page.tsx",
    "../components/message-thread.tsx",
  ];

  for (const file of surfaces) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /ReportTargetButton/);
  }
});

test("shell layouts check moderation before member queries", () => {
  const desktopLayout = readFileSync(
    new URL("../app/(desktop)/layout.tsx", import.meta.url),
    "utf8",
  );
  const mobileLayout = readFileSync(new URL("../app/m/layout.tsx", import.meta.url), "utf8");
  const rootLayout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(desktopLayout, /loadModerationSnapshot/);
  assert.match(desktopLayout, /!banned/);
  assert.match(mobileLayout, /loadModerationSnapshot/);
  assert.match(rootLayout, /ModerationBannedGate/);
  assert.match(rootLayout, /loadModerationSnapshot/);
});

test("rapid report selection keeps evidence and action target bound to the latest report", async () => {
  const reportA: ReportRow = {
    id: "report-a",
    target_type: "user",
    target_id: "target-a",
    target_user_id: "reported-a",
    reporter_id: "reporter-a",
    reason: "Reason A",
    status: "pending",
    resolution: null,
    created_at: "2026-07-12T00:00:00.000Z",
  };
  const reportB: ReportRow = {
    id: "report-b",
    target_type: "user",
    target_id: "target-b",
    target_user_id: "reported-b",
    reporter_id: "reporter-b",
    reason: "Reason B",
    status: "pending",
    resolution: null,
    created_at: "2026-07-12T00:01:00.000Z",
  };
  const evidenceA = moderationEvidence("report-a", "Evidence A");
  const evidenceB = moderationEvidence("report-b", "Evidence B");
  const requestA = deferred<ModerationEvidence>();
  const requestB = deferred<ModerationEvidence>();
  let state = createModerationEvidenceState(reportA.id);

  const settle = async (
    reportId: string,
    requestToken: number,
    request: Promise<ModerationEvidence>,
  ) => ({
      type: "resolve" as const,
      reportId,
      requestToken,
      evidence: await request,
    });

  const loadA = settle(reportA.id, state.requestToken, requestA.promise);
  state = moderationEvidenceReducer(state, { type: "select", reportId: reportB.id });

  assert.equal(state.selectedReportId, reportB.id);
  assert.equal(state.loading, true);
  assert.equal(state.evidence, null);
  assert.equal(bindModerationActionTarget(state, reportB), null);

  const loadB = settle(reportB.id, state.requestToken, requestB.promise);
  requestB.resolve(evidenceB);
  state = moderationEvidenceReducer(state, await loadB);

  assert.equal(isModerationEvidenceReady(state), true);
  assert.equal(visibleModerationEvidence(state)?.report?.id, reportB.id);
  assert.deepEqual(bindModerationActionTarget(state, reportB), {
    reportId: reportB.id,
    reportedUserId: reportB.target_user_id,
    reporterUserId: reportB.reporter_id,
    reason: reportB.reason,
  });

  const settledB = state;
  requestA.resolve(evidenceA);
  state = moderationEvidenceReducer(state, await loadA);

  assert.equal(state, settledB);
  assert.equal(visibleModerationEvidence(state)?.report?.id, reportB.id);
  assert.equal(bindModerationActionTarget(state, reportA), null);
  assert.equal(bindModerationActionTarget(state, reportB)?.reportId, reportB.id);
});

function moderationEvidence(id: string, body: string): ModerationEvidence {
  return {
    report: {
      id,
      target_type: "user",
      reason: id,
      details: null,
      status: "pending",
    },
    evidence: { body },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

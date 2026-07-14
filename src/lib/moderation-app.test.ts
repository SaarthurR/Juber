import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  bannedPagePath,
  mapAppealSubmitError,
  mapReportSubmitError,
  parseModerationNotices,
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
    appeal: {
      id: "appeal-1",
      status: "pending",
      created_at: "2026-07-11T01:00:00.000Z",
      resolved_at: null,
    },
    warnings: [{
      id: "w1",
      note: "Please follow guidelines",
      created_at: "2026-07-10T00:00:00.000Z",
      outcome_id: "outcome-1",
      acknowledged_at: null,
    }],
    outcomes: [{
      id: "outcome-1",
      type: "warning",
      source_action_id: "action-1",
      acknowledged_at: null,
      created_at: "2026-07-10T00:00:00.000Z",
    }],
    outcome_cursor: {
      id: "outcome-1",
      created_at: "2026-07-10T00:00:00.000Z",
    },
  });

  assert.equal(snapshot.banned, true);
  assert.equal(snapshot.ban?.reason, "Harassment");
  assert.equal(snapshot.hasPendingAppeal, true);
  assert.equal(snapshot.appeal?.status, "pending");
  assert.equal(snapshot.warnings.length, 1);
  assert.equal(snapshot.warnings[0]?.outcomeId, "outcome-1");
  assert.equal(snapshot.outcomes[0]?.sourceActionId, "action-1");
});

test("report and appeal errors map to user-safe copy", () => {
  assert.match(mapReportSubmitError("Report rate limit exceeded"), /too many reports/i);
  assert.match(mapAppealSubmitError("A pending appeal already exists"), /pending appeal/i);
});

test("ban gate chooses the matching shell path", () => {
  assert.equal(bannedPagePath(true), "/m/banned");
  assert.equal(bannedPagePath(false), "/banned");
});

test("moderation app routes and RPC wiring exist", () => {
  const files = [
    "../app/moderation/actions.ts",
    "../components/report-target-button.tsx",
    "../components/admin-moderation/workspace.tsx",
    "../components/admin-moderation/appeals-queue.tsx",
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
  const adminReads = readFileSync(
    new URL("./admin-moderation-server.ts", import.meta.url),
    "utf8",
  );
  assert.match(actions, /rpc\("submit_report"/);
  assert.match(actions, /rpc\("submit_appeal"/);
  assert.match(adminReads, /rpc\("admin_report_evidence"/);
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
  assert.match(rootLayout, /ModerationStateProvider/);
  assert.match(rootLayout, /loadModerationSnapshot/);
});

test("rapid report selection keeps evidence and action target bound to the latest report", () => {
  const decision = readFileSync(new URL("../components/admin-moderation/decision-tools.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../components/admin-moderation/case-detail.tsx", import.meta.url), "utf8");
  assert.match(decision, /abortRef\.current\?\.abort\(\)/);
  assert.match(decision, /requestTokenRef\.current !== requestToken/);
  assert.match(decision, /next\.report_id !== report\.id/);
  assert.match(decision, /evidence_receipt_id/);
  assert.match(detail, /<CaseDecisionTools key=\{report\.id\}/);
});

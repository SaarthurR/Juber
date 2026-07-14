import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../../supabase/migrations/20260714024623_moderation_case_workspace.sql");
const desktopAdmin = read("../app/(desktop)/admin/page.tsx");
const desktopModeration = read("../app/(desktop)/admin/moderation/page.tsx");
const mobileAdmin = read("../app/m/admin/page.tsx");
const actions = read("../app/moderation/actions.ts");
const workspace = read("../components/admin-moderation/workspace.tsx");
const reportQueue = read("../components/admin-moderation/report-queue.tsx");
const detail = read("../components/admin-moderation/case-detail.tsx");
const decision = read("../components/admin-moderation/decision-tools.tsx");
const appeals = read("../components/admin-moderation/appeals-queue.tsx");
const history = read("../components/admin-moderation/decision-history.tsx");
const server = read("./admin-moderation-server.ts");

test("admin summaries never request or render evidence", () => {
  assert.match(desktopAdmin, /loadAdminHome/);
  assert.match(mobileAdmin, /loadAdminHome/);
  assert.doesNotMatch(desktopAdmin, /admin_report_evidence|AdminModerationPanel/);
  assert.doesNotMatch(mobileAdmin, /admin_report_evidence|AdminModerationPanel/);
  assert.match(desktopAdmin, /Open moderation workspace/);
  assert.match(mobileAdmin, /Open moderation workspace/);
});

test("canonical workspace is URL backed with wide two-pane and narrow exclusive modes", () => {
  assert.match(desktopModeration, /validAdminUuid\(query\.report\)/);
  assert.match(desktopModeration, /loadAdminReportCases/);
  assert.match(desktopModeration, /loadAdminReportCaseContext/);
  assert.match(workspace, /xl:grid-cols-\[20rem_minmax\(0,1fr\)\]/);
  assert.match(workspace, /context \? "hidden xl:block"/);
  assert.match(detail, /Back to reports/);
  assert.match(reportQueue, /aria-current/);
  assert.match(reportQueue, /Load older reports/);
  assert.match(desktopModeration, /queue=appeals/);
  assert.match(desktopModeration, /loadAdminAppeals/);
  assert.match(appeals, /adminResolveAppealAction/);
  assert.match(appeals, /Review grant/);
  assert.match(appeals, /Review denial/);
  assert.match(appeals, /Confirm appeal/);
  assert.match(appeals, /name="internal_note"/);
  assert.match(appeals, /Load older appeals/);
  assert.match(server, /appealsQuery\.or/);
  assert.match(server, /boundedLimit \+ 1/);
});

test("read handlers use frozen metadata and audited evidence RPCs", () => {
  for (const rpc of [
    "admin_list_report_cases",
    "admin_report_case_context",
    "admin_list_user_reports",
    "admin_list_report_actions",
    "admin_report_evidence",
  ]) assert.match(server, new RegExp(rpc));
  assert.match(server, /Math\.min\(Math\.max\(limit, 1\), 50\)/);
  assert.match(decision, /\/evidence/);
  assert.match(decision, /requestTokenRef/);
  assert.match(decision, /next\.report_id !== report\.id/);
});

test("one evidence-gated form confirms every close or safe revision", () => {
  assert.match(decision, /adminDecisionOptions/);
  assert.match(decision, /evidence_receipt_id/);
  assert.match(decision, /Review decision/);
  assert.match(decision, /Confirm decision/);
  assert.match(decision, /Visible to member/);
  assert.match(decision, /Internal only/);
  assert.match(decision, /context\.can_revise/);
  assert.match(decision, /revision_block_reason/);
  assert.match(decision, /maxLength=\{500\}/);
  assert.match(decision, /context\.reported !== null/);
  assert.match(history, /Previous, superseded/);
  assert.match(history, /appeal_resolved/);
  assert.match(history, /Internal only:/);
  assert.match(history, /Member-facing reason:/);
  assert.match(history, /item\.action === "report_status" \|\| item\.action === "verdict_revised"/);
  assert.match(reportQueue, /adminLabel\(report\.status\)/);
  assert.match(actions, /rpc\("admin_close_report_case"/);
  assert.match(actions, /rpc\("admin_revise_report_decision"/);
  assert.match(actions, /rpc\("admin_compensate_ban"/);
  assert.match(actions, /payload\?\.outcome !== "resolved"/);
  assert.match(actions, /This appeal no longer exists/);
  assert.doesNotMatch(actions, /rpc\("admin_warn_user"|rpc\("admin_ban_user"|rpc\("admin_unban_user"/);
});

test("persistence contract keeps reads redacted and revisions enforcement-safe", () => {
  const evidenceRpc = migration.slice(
    migration.indexOf("create or replace function public.admin_report_evidence"),
    migration.indexOf("create or replace function public.admin_set_report_status"),
  );
  assert.doesNotMatch(evidenceRpc, /from public\.messages/);
  assert.doesNotMatch(evidenceRpc, /'(email|phone|conversation_id|message_id|sender_id)',/);
  assert.match(migration, /admin_close_report_case/);
  assert.match(migration, /admin_revise_report_decision/);
  assert.match(migration, /admin_compensate_ban/);
  assert.match(migration, /Delivered enforcement cannot be rewritten/);
});

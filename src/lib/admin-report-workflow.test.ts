import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const migration = read("../../supabase/migrations/20260713212211_admin_report_workflow.sql");
const historyUpperBoundMigration = read(
  "../../supabase/migrations/20260713222740_report_history_upper_bound.sql",
);
const desktopAdmin = read("../app/(desktop)/admin/page.tsx");
const desktopModeration = read("../app/(desktop)/admin/moderation/page.tsx");
const mobileAdmin = read("../app/m/admin/page.tsx");
const reportForm = read("../components/report-target-button.tsx");
const moderationPanel = read("../components/admin-moderation-panel.tsx");
const moderationActions = read("../app/moderation/actions.ts");
const moderationUi = read("./moderation-admin-ui.ts");
const moderationServer = read("./moderation-server.ts");

test("report workflow migration keeps notifications generic and evidence immutable", () => {
  assert.match(migration, /add column report_id uuid/);
  assert.match(migration, /references public\.reports\(id\) on delete cascade/);
  assert.match(migration, /notifications_report_recipient_unique_idx/);
  assert.match(migration, /select p\.id, null, 'moderation_report_submitted', v_report_id/);
  assert.match(migration, /p_include_message_context boolean/);
  assert.match(migration, /'context_included', coalesce\(p_include_message_context, false\)/);
  assert.match(migration, /m2\.id <> p_target_id/);
  assert.match(migration, /limit 10/);
  assert.match(historyUpperBoundMigration, /m2\.created_at <= v_message_created_at/);
  assert.match(historyUpperBoundMigration, /m2\.id <> p_target_id/);
  assert.match(historyUpperBoundMigration, /limit 10/);
  assert.match(
    historyUpperBoundMigration,
    /select p\.id, null, 'moderation_report_submitted', v_report_id/,
  );
  assert.match(historyUpperBoundMigration, /security definer/);
  assert.match(historyUpperBoundMigration, /set search_path = ''/);
  assert.match(
    historyUpperBoundMigration,
    /revoke all on function public\.submit_report\(text, uuid, text, text, boolean\)[\s\S]*from public, anon/,
  );
  assert.match(
    historyUpperBoundMigration,
    /grant execute on function public\.submit_report\(text, uuid, text, text, boolean\)[\s\S]*to authenticated, service_role/,
  );

  const evidenceRpc = migration.slice(
    migration.indexOf("create or replace function public.admin_report_evidence"),
    migration.indexOf("create or replace function public.admin_ban_user"),
  );
  assert.doesNotMatch(evidenceRpc, /from public\.messages/);
  assert.doesNotMatch(evidenceRpc, /email|phone|thread/);
  assert.match(evidenceRpc, /'scope', 'snapshot'/);
});

test("admin routes use native disclosures and newest-open deep-link selection", () => {
  assert.match(desktopAdmin, /<details/);
  assert.match(mobileAdmin, /<details/);
  assert.match(desktopAdmin, /<AdminModerationPanel/);
  assert.match(desktopAdmin, /initialReport=\{queue\.selectedReport\}/);
  assert.match(mobileAdmin, /initialReport=\{queue\.selectedReport\}/);
  for (const route of [desktopAdmin, desktopModeration, mobileAdmin]) {
    assert.match(route, /key=\{queue\.selectedReport\?\.id \?\? "none"\}/);
  }
  assert.match(moderationPanel, /title="Open reports"/);
  assert.match(moderationPanel, /selectedReport\.resolution/);
  assert.match(moderationPanel, /Resolved ·/);
  assert.match(moderationPanel, /This resolved report is read-only/);
  assert.match(moderationPanel, /isTerminal \?/);
  assert.match(moderationServer, /order\("created_at", \{ ascending: false \}\)/);
  assert.match(moderationServer, /selectedReport: selectedReport \?\? openReports\[0\] \?\? null/);
});

test("message context is opt-in and bans use server-computed durations", () => {
  assert.match(reportForm, /targetType === "message"/);
  assert.match(reportForm, /name="include_message_context"/);
  assert.match(reportForm, /The reported message is always included/);
  assert.match(reportForm, /up to 10\s+nearby messages/);
  assert.match(moderationActions, /p_duration_days: durationDays/);
  assert.match(moderationActions, /p_report_id: reportId/);
  assert.match(migration, /v_report\.status in \('actioned', 'dismissed'\)/);
  assert.match(migration, /admin_unban_user\(uuid, text, uuid\)/);
  assert.doesNotMatch(moderationActions, /p_expires_at|Date\.now\(\)/);
  assert.match(moderationUi, /Confirm \$\{banDays \?\? 7\}-day ban/);
  assert.match(moderationActions, /Report actioned/);
});

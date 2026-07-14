import "server-only";

import {
  parseAdminEvidence,
  parseAdminReportActions,
  parseAdminReportContext,
  parseAdminReportList,
  type AdminAppealCase,
  type AdminAppealList,
  type AdminReportCase,
  type AdminReportActionCategory,
  type AdminReportCursor,
  type AdminReportDirection,
  type AdminReportScope,
} from "@/lib/admin-moderation";
import { requireAdminProfile } from "@/lib/moderation-server";
import { getDemoRuntime, getDemoStore } from "@/lib/demo/runtime";
import { queryDemoAdminCase, queryDemoAdminEvidence, queryDemoAdminReports } from "@/lib/demo/queries";
import type { DemoReport, DemoState } from "@/lib/demo/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validAdminUuid(value: string | string[] | undefined) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export function adminCursorFromSearchParams(params: URLSearchParams) {
  const createdAt = params.get("cursor_created_at");
  const id = validAdminUuid(params.get("cursor_id") ?? undefined);
  return createdAt && !Number.isNaN(Date.parse(createdAt)) && id
    ? { createdAt, id }
    : null;
}

function demoReportCase(state: DemoState, report: DemoReport): AdminReportCase {
  return {
    id: report.id,
    target_type: report.targetType,
    target_id: report.targetId,
    target_user_id: report.targetUserId,
    reporter_id: report.reporterId,
    reason: report.reason,
    details: report.details,
    status: report.status,
    resolution: report.resolution,
    verdict: report.verdict,
    enforcement: report.enforcement,
    verdict_version: report.verdictVersion,
    ban_days: report.banDays,
    created_at: report.createdAt,
    reviewed_at: report.reviewedAt,
    reviewer_name: report.reviewedBy ? state.profiles[report.reviewedBy]?.full_name ?? null : null,
    reporter_name: state.profiles[report.reporterId]?.full_name ?? null,
    reported_name: report.targetUserId ? state.profiles[report.targetUserId]?.full_name ?? null : null,
  };
}

function retainedCounts(state: DemoState, userId: string) {
  const counts = (direction: "made" | "received", closed: boolean) => Object.values(state.reports).filter((report) => {
    const matches = direction === "made" ? report.reporterId === userId : report.targetUserId === userId;
    const isClosed = report.status === "actioned" || report.status === "dismissed";
    return matches && isClosed === closed;
  }).length;
  return {
    made: { open: counts("made", false), closed: counts("made", true) },
    received: { open: counts("received", false), closed: counts("received", true) },
  };
}

export async function loadAdminReportCases({
  scope = "open",
  reason = null,
  cursor = null,
  limit = 25,
}: {
  scope?: AdminReportScope;
  reason?: string | null;
  cursor?: AdminReportCursor | null;
  limit?: number;
} = {}) {
  const demo = await getDemoRuntime();
  if (demo) {
    const reports = queryDemoAdminReports(demo.state, demo.activeActorId)
      .filter((report) => (scope === "open") === (report.status === "pending" || report.status === "reviewing"))
      .filter((report) => !reason || report.reason === reason)
      .slice(0, Math.min(Math.max(limit, 1), 50));
    return { data: { items: reports.map((report) => demoReportCase(demo.state, report)), total: reports.length, nextCursor: null }, error: null };
  }
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.rpc("admin_list_report_cases", {
    p_scope: scope,
    p_reason: reason,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: Math.min(Math.max(limit, 1), 50),
  });
  return { data: parseAdminReportList(data), error: error?.message ?? null };
}

export async function loadAdminReportCaseContext(reportId: string) {
  const demo = await getDemoRuntime();
  if (demo) {
    const value = queryDemoAdminCase(demo.state, demo.activeActorId, reportId);
    if (!value) return { data: null, error: null };
    const identity = (userId: string | null) => {
      const profile = userId ? demo.state.profiles[userId] : null;
      return profile ? {
        id: profile.id,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        neighborhood: profile.neighborhood,
        bio: profile.bio,
        car_make_model: profile.car_make_model,
        car_color: profile.car_color,
        created_at: profile.created_at,
      } : null;
    };
    return {
      data: {
        report: demoReportCase(demo.state, value.report),
        reporter: identity(value.reporter?.id ?? null),
        reported: identity(value.reported?.id ?? null),
        active_ban: value.activeBan ? {
          ban_id: value.activeBan.id,
          report_id: value.activeBan.reportId,
          reason: value.activeBan.reason,
          expires_at: value.activeBan.expiresAt,
          created_at: value.activeBan.createdAt,
        } : null,
        retained_counts: {
          reporter: retainedCounts(demo.state, value.report.reporterId),
          reported: value.report.targetUserId ? retainedCounts(demo.state, value.report.targetUserId) : null,
        },
        history: value.history.map((action) => ({
          id: action.id,
          action: action.action,
          detail: action.detail,
          created_at: action.createdAt,
          reviewer_name: action.actorId ? demo.state.profiles[action.actorId]?.full_name ?? null : null,
          current: true,
          superseded: false,
        })),
        can_revise: value.canRevise,
        revision_block_reason: value.canRevise ? null : "Delivered enforcement cannot be revised.",
      },
      error: null,
    };
  }
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.rpc("admin_report_case_context", {
    p_report_id: reportId,
  });
  return { data: parseAdminReportContext(data), error: error?.message ?? null };
}

export async function loadAdminReportEvidence(reportId: string) {
  const demo = await getDemoRuntime();
  if (demo) {
    const next = await getDemoStore().mutate(demo.id, demo.revision, { type: "reveal_evidence", actorId: demo.activeActorId, reportId });
    const receipt = Object.values(next.state.evidenceReceipts)
      .filter((item) => item.reportId === reportId && item.adminId === demo.activeActorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const evidence = receipt ? queryDemoAdminEvidence(next.state, demo.activeActorId, reportId, receipt.id) : null;
    const report = next.state.reports[reportId];
    return {
      data: evidence && report ? { report_id: reportId, receipt_id: receipt.id, target_type: report.targetType, snapshot: evidence.snapshot } : null,
      error: evidence ? null : "Could not open report evidence.",
    };
  }
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.rpc("admin_report_evidence", {
    p_report_id: reportId,
  });
  return { data: parseAdminEvidence(data), error: error?.message ?? null };
}

export async function loadAdminUserReports({
  userId,
  direction,
  scope = "all",
  cursor = null,
  limit = 25,
}: {
  userId: string;
  direction: AdminReportDirection;
  scope?: "open" | "closed" | "all";
  cursor?: AdminReportCursor | null;
  limit?: number;
}) {
  const demo = await getDemoRuntime();
  if (demo) {
    const reports = queryDemoAdminReports(demo.state, demo.activeActorId)
      .filter((report) => direction === "made" ? report.reporterId === userId : report.targetUserId === userId)
      .filter((report) => scope === "all" || (scope === "open") === (report.status === "pending" || report.status === "reviewing"))
      .slice(0, Math.min(Math.max(limit, 1), 50));
    return { data: { items: reports.map((report) => demoReportCase(demo.state, report)), total: reports.length, nextCursor: null }, error: null };
  }
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.rpc("admin_list_user_reports", {
    p_user_id: userId,
    p_direction: direction,
    p_scope: scope,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: Math.min(Math.max(limit, 1), 50),
  });
  return { data: parseAdminReportList(data), error: error?.message ?? null };
}

export async function loadAdminReportActions({
  reportId,
  category,
  cursor = null,
  limit = 25,
}: {
  reportId: string;
  category: AdminReportActionCategory;
  cursor?: AdminReportCursor | null;
  limit?: number;
}) {
  const demo = await getDemoRuntime();
  if (demo) {
    const actions = Object.values(demo.state.moderationActions)
      .filter((action) => action.reportId === reportId)
      .filter((action) => category === "decision" ? ["report_status", "verdict_revised", "warning", "ban", "unban", "appeal_resolved"].includes(action.action) : true)
      .slice(0, Math.min(Math.max(limit, 1), 50));
    return { data: { items: actions.map((action) => ({ id: action.id, action: action.action, detail: action.detail, created_at: action.createdAt, reviewer_name: action.actorId ? demo.state.profiles[action.actorId]?.full_name ?? null : null, current: true, superseded: false })), nextCursor: null }, error: null };
  }
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.rpc("admin_list_report_actions", {
    p_report_id: reportId,
    p_category: category,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: Math.min(Math.max(limit, 1), 50),
  });
  return { data: parseAdminReportActions(data), error: error?.message ?? null };
}

export async function loadAdminModerationSummary() {
  const demo = await getDemoRuntime();
  if (demo) {
    return {
      openReports: queryDemoAdminReports(demo.state, demo.activeActorId).filter((report) => report.status === "pending" || report.status === "reviewing").length,
      openAppeals: Object.values(demo.state.appeals).filter((appeal) => appeal.status === "pending").length,
      error: null,
    };
  }
  const { supabase } = await requireAdminProfile();
  const [{ data: reports, error: reportError }, { count: appeals, error: appealError }] =
    await Promise.all([
      supabase.rpc("admin_list_report_cases", {
        p_scope: "open",
        p_reason: null,
        p_cursor_created_at: null,
        p_cursor_id: null,
        p_limit: 1,
      }),
      supabase
        .from("appeals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
  return {
    openReports: parseAdminReportList(reports).total,
    openAppeals: appeals ?? 0,
    error: reportError?.message ?? appealError?.message ?? null,
  };
}

export async function loadAdminAppeals({ cursor = null, limit = 25 }: { cursor?: AdminReportCursor | null; limit?: number } = {}) {
  const demo = await getDemoRuntime();
  if (demo) {
    const items = Object.values(demo.state.appeals)
      .filter((appeal) => appeal.status === "pending")
      .slice(0, Math.min(Math.max(limit, 1), 50))
      .map((appeal) => ({ id: appeal.id, user_id: appeal.userId, member_name: demo.state.profiles[appeal.userId]?.full_name ?? null, text: appeal.text, created_at: appeal.createdAt, ban_id: appeal.banId }));
    return { data: { items, total: items.length, nextCursor: null, continuation: Boolean(cursor) }, error: null };
  }
  const { supabase } = await requireAdminProfile();
  const boundedLimit = Math.min(Math.max(limit, 1), 50);
  let appealsQuery = supabase
    .from("appeals")
    .select("id, user_id, text, created_at, ban_id")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(boundedLimit + 1);
  if (cursor) {
    appealsQuery = appealsQuery.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    appealsQuery,
    supabase
      .from("appeals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  const empty: AdminAppealList = { items: [], total: 0, nextCursor: null, continuation: Boolean(cursor) };
  if (error || countError) return { data: empty, error: error?.message ?? countError?.message ?? null };

  const page = ((data ?? []) as Omit<AdminAppealCase, "member_name">[]).slice(0, boundedLimit);
  const hasNext = (data?.length ?? 0) > boundedLimit;
  const appeals = page;
  const userIds = [...new Set(appeals.map((appeal) => appeal.user_id))];
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [], error: null };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  return {
    data: {
      items: appeals.map((appeal) => ({ ...appeal, member_name: names.get(appeal.user_id) ?? null })),
      total: count ?? 0,
      nextCursor: hasNext && page.length
        ? { createdAt: page.at(-1)!.created_at, id: page.at(-1)!.id }
        : null,
      continuation: Boolean(cursor),
    },
    error: profileError?.message ?? null,
  };
}

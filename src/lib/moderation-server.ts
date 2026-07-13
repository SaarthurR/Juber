import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import {
  parseModerationNotices,
  type AppealRow,
  type ModerationSnapshot,
  type ReportRow,
} from "@/lib/moderation";

export const loadModerationSnapshot = cache(async (): Promise<ModerationSnapshot | null> => {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return null;

  const { data, error } = await supabase.rpc("get_moderation_notices");
  if (error) {
    return {
      banned: false,
      ban: null,
      hasPendingAppeal: false,
      warnings: [],
    };
  }

  return parseModerationNotices(data);
});

export async function requireAdminProfile() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) redirect("/");
  return { supabase, user, profile };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadAdminModerationQueue(requestedReportId?: string | string[]) {
  const { supabase } = await requireAdminProfile();
  const reportId =
    typeof requestedReportId === "string" && UUID.test(requestedReportId)
      ? requestedReportId
      : null;

  const [{ data: reports, error: reportsError }, { data: appeals, error: appealsError }] =
    await Promise.all([
      supabase
        .from("reports")
        .select("id, target_type, target_id, target_user_id, reporter_id, reason, status, resolution, created_at")
        .in("status", ["pending", "reviewing"])
        .order("created_at", { ascending: false }),
      supabase
        .from("appeals")
        .select("id, user_id, text, status, created_at, ban_id")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  const openReports = (reports ?? []) as ReportRow[];
  let selectedReport = reportId
    ? openReports.find((report) => report.id === reportId) ?? null
    : null;
  let selectedReportError: string | null = null;

  if (reportId && !selectedReport) {
    const { data, error } = await supabase
      .from("reports")
      .select("id, target_type, target_id, target_user_id, reporter_id, reason, status, resolution, created_at")
      .eq("id", reportId)
      .maybeSingle();
    selectedReport = (data as ReportRow | null) ?? null;
    selectedReportError = error?.message ?? null;
  }

  return {
    reports: openReports,
    appeals: ((appeals ?? []) as AppealRow[]),
    selectedReport: selectedReport ?? openReports[0] ?? null,
    error:
      reportsError?.message
      ?? appealsError?.message
      ?? selectedReportError,
  };
}

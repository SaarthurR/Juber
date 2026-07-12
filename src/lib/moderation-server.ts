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

export async function loadAdminModerationQueue() {
  const { supabase } = await requireAdminProfile();

  const [{ data: reports, error: reportsError }, { data: appeals, error: appealsError }] =
    await Promise.all([
      supabase
        .from("reports")
        .select("id, target_type, target_id, target_user_id, reporter_id, reason, status, created_at")
        .in("status", ["pending", "reviewing"])
        .order("created_at", { ascending: false }),
      supabase
        .from("appeals")
        .select("id, user_id, text, status, created_at, ban_id")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  return {
    reports: ((reports ?? []) as ReportRow[]),
    appeals: ((appeals ?? []) as AppealRow[]),
    error: reportsError?.message ?? appealsError?.message ?? null,
  };
}

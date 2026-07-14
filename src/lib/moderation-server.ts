import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { queryDemoModeration } from "@/lib/demo/queries";
import {
  EMPTY_MODERATION_SNAPSHOT,
  parseModerationNotices,
  type ModerationSnapshot,
} from "@/lib/moderation";

export const loadModerationSnapshot = cache(async (): Promise<ModerationSnapshot | null> => {
  const runtime = await getDemoRuntime();
  if (runtime) {
    const result = queryDemoModeration(runtime.state, runtime.activeActorId);
    const appeal = result.appeals.find((item) => item.status === "pending") ?? result.appeals[0] ?? null;
    const outcomes = result.outcomes.map((item) => ({
      id: item.id,
      type: item.type,
      sourceActionId: item.sourceActionId,
      acknowledgedAt: item.acknowledgedAt,
      createdAt: item.createdAt,
      memberReason: item.type === "unban"
        && typeof runtime.state.moderationActions[item.sourceActionId]?.detail.reason === "string"
          ? runtime.state.moderationActions[item.sourceActionId].detail.reason as string
          : null,
    }));
    return {
      banned: result.banned,
      ban: result.ban ? {
        reason: result.ban.reason,
        expires_at: result.ban.expiresAt,
        created_at: result.ban.createdAt,
        ban_id: result.ban.id,
      } : null,
      hasPendingAppeal: appeal?.status === "pending",
      appeal: appeal ? {
        id: appeal.id,
        status: appeal.status,
        createdAt: appeal.createdAt,
        resolvedAt: appeal.resolvedAt,
      } : null,
      warnings: result.warnings.map((warning) => {
        const outcome = runtime.state.outcomes[warning.outcomeId];
        return {
          id: warning.id,
          note: warning.note,
          created_at: warning.createdAt,
          outcomeId: warning.outcomeId,
          acknowledgedAt: outcome?.acknowledgedAt ?? null,
        };
      }),
      outcomes,
      outcomeCursor: outcomes.length ? { id: outcomes.at(-1)!.id, createdAt: outcomes.at(-1)!.createdAt } : null,
    };
  }
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return null;

  const { data, error } = await supabase.rpc("get_moderation_notices");
  if (error) {
    return { ...EMPTY_MODERATION_SNAPSHOT, loadError: true };
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

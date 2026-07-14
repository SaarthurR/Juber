"use server";

import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDemoRuntime, getDemoStore } from "@/lib/demo/runtime";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ModerationOutcomeActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function acknowledgeModerationOutcomeAction(
  outcomeId: string,
): Promise<ModerationOutcomeActionResult> {
  if (!UUID.test(outcomeId)) {
    return { ok: false, error: "This moderation notice is no longer available." };
  }

  const demo = await getDemoRuntime();
  if (demo) {
    try {
      await getDemoStore().mutate(demo.id, demo.revision, { type: "acknowledge_outcome", actorId: demo.activeActorId, outcomeId });
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not save your acknowledgement. Please retry." };
    }
  }

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again, then retry." };
  }

  const { data, error } = await supabase.rpc("acknowledge_moderation_outcome", {
    p_outcome_id: outcomeId,
  });
  if (error || data !== true) {
    return { ok: false, error: "Could not save your acknowledgement. Please retry." };
  }
  return { ok: true };
}

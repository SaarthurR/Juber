import type { SupabaseClient } from "@supabase/supabase-js";

type ContactClient = Pick<SupabaseClient, "rpc">;

/** Fail-closed contact readiness check for coordination write paths. */
export async function hasContact(
  supabase: ContactClient,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await supabase.rpc("profile_has_contact", {
    p_profile_id: userId,
  });
  if (error) {
    console.error("profile_has_contact failed", { code: error.code, userId });
    return false;
  }
  return data === true;
}

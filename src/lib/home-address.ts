import "server-only";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Self-only saved home via `get_home_address` RPC (migration 0035). */
export async function getHomeAddress(supabase: ServerClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_home_address");
  if (error) {
    console.error("get_home_address failed", { code: error.code });
    return null;
  }
  return typeof data === "string" && data.length ? data : null;
}

export async function setHomeAddress(
  supabase: ServerClient,
  homeAddress: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("set_home_address", {
    p_home_address: homeAddress,
  });
  if (error) throw new Error(error.message);
}

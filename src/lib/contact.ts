import "server-only";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type Contact = { phone: string | null; whatsapp: string | null };

/**
 * phone/whatsapp are not selectable from `profiles` directly (column-level RLS,
 * see migration 0020). Read them through these booking-scoped SECURITY DEFINER
 * RPCs instead. `get_contact` returns the numbers only for the owner or a
 * confirmed booking counterparty; otherwise the row (and the numbers) are null.
 */
export async function getContact(
  supabase: ServerClient,
  userId: string | null | undefined,
): Promise<Contact> {
  if (!userId) return { phone: null, whatsapp: null };
  const { data } = await supabase.rpc("get_contact", { p_user_id: userId });
  const row = Array.isArray(data) ? data[0] : data;
  return { phone: row?.phone ?? null, whatsapp: row?.whatsapp ?? null };
}

/** Whether a user has any reachable contact method (drives the contact gate). */
export async function hasContact(
  supabase: ServerClient,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase.rpc("profile_has_contact", { p_profile_id: userId });
  if (error) {
    console.error("profile_has_contact failed", { code: error.code, userId });
    return true;
  }
  return Boolean(data);
}

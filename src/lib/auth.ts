import { cache } from "react";
import { resolveIdentity } from "@/lib/demo/access";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type AuthUser = { id: string; email: string | null };

/**
 * Resolve the signed-in user from the session JWT.
 *
 * Uses `getClaims()`, which verifies the token locally against the project's
 * (cached) JWKS — no per-request round-trip to the Auth server like `getUser()`
 * makes. With asymmetric JWT signing keys this is effectively free; with legacy
 * symmetric secrets it transparently falls back to a verified `getUser()` call,
 * so it is never slower.
 */
export async function getAuthUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string) ?? null };
}

/**
 * Returns the current auth user and their profile row, or nulls if signed out.
 *
 * Wrapped in React `cache` so multiple callers within the same server render
 * (e.g. the Navbar and the page itself) share a single auth + profile fetch
 * instead of each issuing their own round-trips.
 */
export const getCurrentUser = cache(async () => {
  return resolveIdentity(await getDemoRuntime(), async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return { user: null, profile: null as Profile | null };
    }
    const supabase = await createClient();
    const user = await getAuthUser(supabase);

    if (!user) return { user: null, profile: null as Profile | null };

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    return { user, profile: (profile as Profile) ?? null };
  });
});

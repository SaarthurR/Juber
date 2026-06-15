import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Returns the current auth user and their profile row, or nulls if signed out.
 *
 * Wrapped in React `cache` so multiple callers within the same server render
 * (e.g. the Navbar and the page itself) share a single auth + profile fetch
 * instead of each issuing their own round-trips.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null as Profile | null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { user, profile: (profile as Profile) ?? null };
});

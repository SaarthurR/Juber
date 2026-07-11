import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DESKTOP_COOKIE,
  authCallbackDestination,
  authOnboardingDestination,
} from "@/lib/route-targets";

// Handles the OAuth redirect from Supabase, exchanging the code for a session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const isMobileUa = /Mobi|Android|iPhone|iPod|Windows Phone/i.test(
    request.headers.get("user-agent") ?? "",
  );
  const forceDesktop = request.cookies.get(DESKTOP_COOKIE)?.value === "1";
  const fallback = isMobileUa && !forceDesktop ? "/m" : "/rides";
  const nextValues = searchParams.getAll("next");
  const next = authCallbackDestination(
    nextValues.length === 1 ? nextValues[0] : null,
    fallback,
  );

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await syncProfileFromProvider(supabase);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: contactReady } = await supabase.rpc("profile_has_contact", {
        p_profile_id: user?.id ?? "",
      });
      if (!contactReady) {
        const onboardingPath = authOnboardingDestination(next, {
          fallback,
          forceDesktop,
        });
        return NextResponse.redirect(`${origin}${onboardingPath}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-error`);
}

// Mirror the Google identity (name + avatar) onto the profile row on each login.
// The DB trigger seeds these only at first signup, so this keeps the avatar in
// sync and backfills profiles created before the metadata was available.
async function syncProfileFromProvider(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const meta = user.user_metadata ?? {};
  const avatarUrl = meta.avatar_url ?? meta.picture ?? null;
  const fullName = meta.full_name ?? meta.name ?? null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const updates: { full_name?: string; avatar_url?: string } = {};
  // Seed the avatar from Google only if the user hasn't set one — otherwise a
  // custom uploaded avatar would be overwritten on every login.
  if (avatarUrl && !profile?.avatar_url) {
    updates.avatar_url = avatarUrl;
  }
  // Backfill the name only if the user hasn't set their own.
  if (fullName && !profile?.full_name) {
    updates.full_name = fullName;
  }

  if (Object.keys(updates).length === 0) return;

  await supabase.from("profiles").update(updates).eq("id", user.id);
}

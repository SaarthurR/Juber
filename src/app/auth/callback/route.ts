import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the OAuth redirect from Supabase, exchanging the code for a session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only honor internal absolute paths — reject protocol-relative ("//evil")
  // or backslash-prefixed values that some browsers treat as external.
  const rawNext = searchParams.get("next") ?? "/rides";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : "/rides";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await syncProfileFromProvider(supabase);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone,whatsapp")
        .eq("id", user?.id ?? "")
        .maybeSingle<{ phone: string | null; whatsapp: string | null }>();
      if (!profile?.phone?.trim() && !profile?.whatsapp?.trim()) {
        const isMobile = /Mobi|Android|iPhone|iPod|Windows Phone/i.test(
          request.headers.get("user-agent") ?? "",
        );
        const onboardingPath = isMobile
          ? "/m/profile/edit?onboarding=1"
          : "/profile?onboarding=1";
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
  // Always keep the avatar matching the Google account picture.
  if (avatarUrl && avatarUrl !== profile?.avatar_url) {
    updates.avatar_url = avatarUrl;
  }
  // Backfill the name only if the user hasn't set their own.
  if (fullName && !profile?.full_name) {
    updates.full_name = fullName;
  }

  if (Object.keys(updates).length === 0) return;

  await supabase.from("profiles").update(updates).eq("id", user.id);
}

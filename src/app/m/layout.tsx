import { BottomNav } from "@/components/mobile/bottom-nav";
import { LandingAuthGate } from "@/components/landing-auth-gate";
import { ModerationNoticeBanner } from "@/components/moderation-notice-banner";
import { getAuthUser } from "@/lib/auth";
import { loadModerationSnapshot } from "@/lib/moderation-server";
import { createClient } from "@/lib/supabase/server";

// The mobile redesign lives under /m: a single phone-width column (centered on
// larger screens) with the persistent bottom tab bar. It stays outside the
// desktop route group, so desktop chrome work is structurally absent.
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  const moderation = user ? await loadModerationSnapshot() : null;
  const banned = Boolean(moderation?.banned);

  const content = (
    <div className="mobile-shell relative mx-auto min-h-screen w-full max-w-[440px] bg-cream sm:border-x sm:border-border">
      {!banned && moderation?.warnings.length ? (
        <ModerationNoticeBanner warnings={moderation.warnings} variant="mobile" />
      ) : null}
      <main>{children}</main>
      {!banned ? <BottomNav /> : null}
    </div>
  );

  return user ? content : <LandingAuthGate>{content}</LandingAuthGate>;
}

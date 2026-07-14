import { BottomNav } from "@/components/mobile/bottom-nav";
import { LandingAuthGate } from "@/components/landing-auth-gate";
import { getCurrentUser } from "@/lib/auth";
import { loadModerationSnapshot } from "@/lib/moderation-server";

// The mobile redesign lives under /m: a single phone-width column (centered on
// larger screens) with the persistent bottom tab bar. It stays outside the
// desktop route group, so desktop chrome work is structurally absent.
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getCurrentUser();
  const moderation = user ? await loadModerationSnapshot() : null;
  const banned = Boolean(moderation?.banned);

  const content = (
    <div className="mobile-shell relative mx-auto min-h-screen w-full max-w-[440px] bg-cream sm:border-x sm:border-border">
      <main>{children}</main>
      {!banned ? <BottomNav /> : null}
    </div>
  );

  return user ? content : <LandingAuthGate>{content}</LandingAuthGate>;
}

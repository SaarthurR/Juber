import { BottomNav } from "@/components/mobile/bottom-nav";
import { TapFeedback } from "@/components/mobile/tap-feedback";
import { LandingAuthGate } from "@/components/landing-auth-gate";
import { getCurrentUser } from "@/lib/auth";

// The mobile redesign lives under /m: a single phone-width column (centered on
// larger screens) with the persistent bottom tab bar. The desktop navbar/footer
// are hidden for these routes by SiteChrome in the root layout.
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getCurrentUser();
  const content = (
    <div className="relative mx-auto min-h-screen w-full max-w-[440px] bg-cream sm:border-x sm:border-border">
      {children}
      <BottomNav />
      <TapFeedback />
    </div>
  );

  return user ? content : <LandingAuthGate>{content}</LandingAuthGate>;
}

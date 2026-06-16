import { BottomNav } from "@/components/mobile/bottom-nav";

// The mobile redesign lives under /m: a single phone-width column (centered on
// larger screens) with the persistent bottom tab bar. The desktop navbar/footer
// are hidden for these routes by SiteChrome in the root layout.
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[440px] bg-cream sm:border-x sm:border-border">
      {children}
      <BottomNav />
    </div>
  );
}

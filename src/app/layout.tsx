import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ModerationBannedGate } from "@/components/moderation-banned-gate";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadModerationSnapshot } from "@/lib/moderation-server";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} — Carpool to the temple`,
  description: APP_TAGLINE,
};

// Next 16 split viewport out of `metadata`. Without `viewport-fit=cover` the
// `env(safe-area-inset-*)` values used by the mobile shell (bottom nav, sticky
// footers, sheets) resolve to 0 on notched phones, so we set it here.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf7f0",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  const moderation = user ? await loadModerationSnapshot() : null;

  return (
    <html
      lang="en"
      className={`${jakarta.variable} h-full`}
      data-scroll-behavior="smooth"
    >
      <body className="flex min-h-full flex-col">
        <ModerationBannedGate banned={Boolean(moderation?.banned)}>
          {children}
        </ModerationBannedGate>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { FooterTagline, SiteChrome } from "@/components/site-chrome";
import { TempleLogo } from "@/components/temple-logo";
import { ContactRequiredGate } from "@/components/contact-required-gate";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasContact } from "@/lib/contact";

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
  const { user } = await getCurrentUser();
  let contactRequired = false;
  if (user) {
    const supabase = await createClient();
    contactRequired = !(await hasContact(supabase, user.id));
  }

  return (
    <html
      lang="en"
      className={`${jakarta.variable} h-full`}
      data-scroll-behavior="smooth"
    >
      <body className="flex min-h-full flex-col">
        <ContactRequiredGate required={contactRequired}>
        <SiteChrome
          navbar={<Navbar />}
          footer={
            <footer className="mt-16 border-t border-[var(--border,#efe4d3)] border-stone-200">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Link
                  href="/"
                  className="flex items-center gap-1.5 font-extrabold text-[15px] text-stone-900"
                >
                  <TempleLogo size={18} className="text-brand-600" />
                  {APP_NAME}
                </Link>
                <FooterTagline />
              </div>

              <div className="flex gap-12 text-sm">
                <div>
                  <p className="mb-2.5 font-medium text-stone-900">Pages</p>
                  <ul className="space-y-1.5 text-sand-text">
                    <li><Link href="/" className="hover:text-stone-900 transition">Home</Link></li>
                    <li><Link href="/rides" className="hover:text-stone-900 transition">Rides</Link></li>
                    <li><Link href="/events" className="hover:text-stone-900 transition">Events</Link></li>
                    <li><Link href="/profile" className="hover:text-stone-900 transition">Profile</Link></li>
                  </ul>
                </div>
                <div>
                  <p className="mb-2.5 font-medium text-stone-900">Contact</p>
                  <ul className="space-y-1.5 text-sand-text">
                    <li><a href="https://wa.me/" className="hover:text-stone-900 transition">WhatsApp</a></li>
                    <li><a href="mailto:hello@jcnc.org" className="hover:text-stone-900 transition">Email</a></li>
                  </ul>
                </div>
                <div>
                  <p className="mb-2.5 font-medium text-stone-900">Legal</p>
                  <ul className="space-y-1.5 text-sand-text">
                    <li><Link href="/terms" className="hover:text-stone-900 transition">Terms</Link></li>
                    <li><Link href="/privacy" className="hover:text-stone-900 transition">Privacy</Link></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-4 border-t border-[#f3ece1] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2.5 text-[13px] font-semibold text-[#6f5b48]">
                <span>An initiative for the</span>
                <Image
                  src="/jcnc-logo.png"
                  alt="Jain Center of Northern California"
                  width={449}
                  height={66}
                  className="h-5 w-auto"
                />
                <span>community ·</span>
                <a
                  href="https://jcnc.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-brand-600 hover:text-brand-700"
                >
                  jcnc.org
                </a>
              </div>
              <p className="text-xs text-stone-600">
                © {new Date().getFullYear()} {APP_NAME}
              </p>
            </div>
          </div>
        </footer>
          }
        >
          {children}
        </SiteChrome>
        </ContactRequiredGate>
      </body>
    </html>
  );
}

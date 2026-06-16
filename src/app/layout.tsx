import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { SiteChrome } from "@/components/site-chrome";
import { TempleLogo } from "@/components/temple-logo";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} — Carpool to the temple`,
  description: APP_TAGLINE,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} h-full`}
      data-scroll-behavior="smooth"
    >
      <body className="flex min-h-full flex-col">
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
                <p className="mt-2 max-w-[220px] text-sm text-stone-500 leading-relaxed">
                  {APP_TAGLINE}
                </p>
              </div>

              <div className="flex gap-12 text-sm">
                <div>
                  <p className="mb-2.5 font-medium text-stone-900">Pages</p>
                  <ul className="space-y-1.5 text-stone-500">
                    <li><Link href="/" className="hover:text-stone-900 transition">Home</Link></li>
                    <li><Link href="/rides" className="hover:text-stone-900 transition">Rides</Link></li>
                    <li><Link href="/events" className="hover:text-stone-900 transition">Events</Link></li>
                    <li><Link href="/profile" className="hover:text-stone-900 transition">Profile</Link></li>
                  </ul>
                </div>
                <div>
                  <p className="mb-2.5 font-medium text-stone-900">Contact</p>
                  <ul className="space-y-1.5 text-stone-500">
                    <li><a href="https://instagram.com" className="hover:text-stone-900 transition">Instagram</a></li>
                    <li><a href="mailto:hello@jcnc.org" className="hover:text-stone-900 transition">Email</a></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-4 border-t border-[#f3ece1] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2.5 text-[13px] font-semibold text-[#a8927a]">
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
              <p className="text-xs text-stone-400">
                © {new Date().getFullYear()} {APP_NAME}
              </p>
            </div>
          </div>
        </footer>
          }
        >
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import { Car } from "lucide-react";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>

        <footer className="mt-16 border-t border-stone-200">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Link
                  href="/"
                  className="flex items-center gap-1.5 font-semibold text-[15px] text-stone-900"
                >
                  <Car size={16} className="text-brand-600" strokeWidth={2.5} />
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

            <div className="mt-8 border-t border-stone-100 pt-6 text-xs text-stone-400">
              © {new Date().getFullYear()} {APP_NAME} · JCNC Carpool
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

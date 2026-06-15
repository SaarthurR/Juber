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
        <footer className="border-t border-stone-200 bg-stone-50">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:grid-cols-[1fr_auto_auto] sm:px-6">
            <div>
              <div className="flex items-center gap-2 text-2xl font-bold">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Car size={20} />
                </span>
                {APP_NAME}
              </div>
              <p className="mt-3 max-w-xs text-sm text-stone-500">{APP_TAGLINE}</p>
            </div>

            <div className="sm:px-8">
              <h3 className="mb-3 font-bold text-stone-900">Pages</h3>
              <ul className="space-y-2 text-sm text-stone-600">
                <li><Link href="/" className="hover:text-brand-600">Home</Link></li>
                <li><Link href="/rides" className="hover:text-brand-600">Rides</Link></li>
                <li><Link href="/events" className="hover:text-brand-600">Events</Link></li>
                <li><Link href="/profile" className="hover:text-brand-600">Profile</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-3 font-bold text-stone-900">Contact</h3>
              <ul className="space-y-2 text-sm text-stone-600">
                <li><a href="https://instagram.com" className="hover:text-brand-600">Instagram</a></li>
                <li><a href="mailto:hello@jcnc.org" className="hover:text-brand-600">Email</a></li>
              </ul>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

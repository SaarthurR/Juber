import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { NotificationsProvider } from "@/components/notifications-provider";
import { RouteProgress } from "@/components/route-progress";
import { TempleLogo } from "@/components/temple-logo";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { loadDesktopNotificationSnapshot } from "@/lib/notifications-server";

function FooterTagline() {
  return (
    <p className="mt-2 max-w-[220px] text-sm leading-relaxed text-sand-text">
      {APP_TAGLINE}
    </p>
  );
}

function DesktopFooter() {
  return (
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
  );
}

export default async function DesktopLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getCurrentUser();
  const notificationSnapshot = user
    ? await loadDesktopNotificationSnapshot(user.id)
    : null;

  return (
    <NotificationsProvider userId={user?.id ?? null} initial={notificationSnapshot}>
      <div className="desktop-shell contents">
        <Navbar user={user} profile={profile} />
        <RouteProgress />
        <main className="flex-1">{children}</main>
        <DesktopFooter />
      </div>
    </NotificationsProvider>
  );
}

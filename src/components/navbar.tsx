import Link from "next/link";
import type { AuthUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { TempleLogo } from "@/components/temple-logo";
import { GoogleSignInButton } from "@/components/auth-button";
import { NotificationBell } from "@/components/notification-bell";
import { MessagesNavLink } from "@/components/messages-nav-link";
import { ActiveNavLink, ActiveProfileLink } from "@/components/active-nav-link";
import type { Profile } from "@/lib/types";

export function Navbar({
  user,
  profile,
}: {
  user: AuthUser | null;
  profile: Profile | null;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#efe4d3] bg-white/95 backdrop-blur-sm">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-[19px] font-extrabold tracking-[-0.03em] text-brand-600 transition hover:text-brand-700"
        >
          <TempleLogo size={28} className="text-brand-600" />
          {APP_NAME}
        </Link>

        <div className="flex items-center gap-1 text-[15px] font-semibold text-[#57534e]">
          <ActiveNavLink href="/rides">Rides</ActiveNavLink>
          <ActiveNavLink href="/events">Events</ActiveNavLink>

          {user ? (
            <>
              <MessagesNavLink />
              <span className="ml-0.5">
                <NotificationBell />
              </span>
              {profile?.is_admin && <ActiveNavLink href="/admin">Admin</ActiveNavLink>}
              <ActiveProfileLink>
                <Avatar src={profile?.avatar_url} name={profile?.full_name} size={32} />
              </ActiveProfileLink>
            </>
          ) : (
            <span className="ml-2">
              <GoogleSignInButton />
            </span>
          )}
        </div>
      </nav>
    </header>
  );
}

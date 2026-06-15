import Link from "next/link";
import { Car } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { GoogleSignInButton } from "@/components/auth-button";

export async function Navbar() {
  const { user, profile } = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[var(--background)]/95 backdrop-blur-sm">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 font-semibold text-[15px] text-stone-900 transition hover:text-brand-600"
        >
          <Car size={17} className="text-brand-600" strokeWidth={2.5} />
          {APP_NAME}
        </Link>

        <div className="flex items-center gap-0.5 text-sm font-medium text-stone-600">
          <NavLink href="/rides">Rides</NavLink>
          <NavLink href="/requests">Requests</NavLink>
          <NavLink href="/events">Events</NavLink>

          {user ? (
            <>
              <NavLink href="/messages">Messages</NavLink>
              {profile?.is_admin && <NavLink href="/admin">Admin</NavLink>}
              <Link href="/profile" className="ml-2 rounded-full transition hover:ring-2 hover:ring-brand-200 hover:ring-offset-1 active:scale-95">
                <Avatar
                  src={profile?.avatar_url}
                  name={profile?.full_name}
                  size={28}
                />
              </Link>
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

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 transition hover:bg-stone-100 hover:text-stone-900"
    >
      {children}
    </Link>
  );
}

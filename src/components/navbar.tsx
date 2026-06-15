import Link from "next/link";
import { Car } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { GoogleSignInButton } from "@/components/auth-button";

export async function Navbar() {
  const { user, profile } = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-[var(--background)]/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">
            <Car size={18} />
          </span>
          {APP_NAME}
        </Link>

        <div className="flex items-center gap-5 text-sm font-medium text-stone-700">
          <Link href="/rides" className="hover:text-brand-600">
            Rides
          </Link>
          <Link href="/requests" className="hover:text-brand-600">
            Requests
          </Link>
          <Link href="/events" className="hover:text-brand-600">
            Events
          </Link>
          {user ? (
            <>
              <Link href="/messages" className="hover:text-brand-600">
                Messages
              </Link>
              {profile?.is_admin && (
                <Link href="/admin" className="hover:text-brand-600">
                  Admin
                </Link>
              )}
              <Link href="/profile" className="flex items-center gap-2">
                <Avatar
                  src={profile?.avatar_url}
                  name={profile?.full_name}
                  size={32}
                />
              </Link>
            </>
          ) : (
            <GoogleSignInButton />
          )}
        </div>
      </nav>
    </header>
  );
}

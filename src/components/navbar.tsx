import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { TempleLogo } from "@/components/temple-logo";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { GoogleSignInButton } from "@/components/auth-button";
import { MessagesNavLink } from "@/components/messages-nav-link";

export async function Navbar() {
  const { user, profile } = await getCurrentUser();

  let unread = 0;
  if (user) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null);
    unread = count ?? 0;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#efe4d3] bg-white/95 backdrop-blur-sm">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 font-extrabold text-[17px] tracking-tight text-brand-600 transition hover:text-brand-700"
        >
          <TempleLogo size={26} className="text-brand-600" />
          {APP_NAME}
        </Link>

        <div className="flex items-center gap-0.5 text-sm font-medium text-stone-600">
          <NavLink href="/rides">Rides</NavLink>
          <NavLink href="/requests">Requests</NavLink>
          <NavLink href="/events">Events</NavLink>

          {user ? (
            <>
              <MessagesNavLink userId={user.id} initialUnread={unread} />
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

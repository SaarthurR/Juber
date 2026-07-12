"use client";

import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { usePathname } from "next/navigation";

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ActiveNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = matchesPath(pathname, href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative rounded-lg px-3 py-1.5 transition-colors duration-200 after:absolute after:inset-x-3 after:-bottom-1 after:h-0.5 after:origin-center after:rounded-full after:bg-brand-600 after:transition-transform after:duration-300 ${
        active
          ? "bg-tint text-brand-700 after:scale-x-100"
          : "after:scale-x-0 hover:bg-tint hover:text-brand-700"
      }`}
    >
      {children}
    </Link>
  );
}

export function ActiveProfileLink({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = matchesPath(pathname, "/profile");

  return (
    <Link
      href="/profile"
      aria-label="Your profile"
      aria-current={active ? "page" : undefined}
      className={`ml-1.5 rounded-full transition duration-200 hover:ring-2 hover:ring-brand-200 hover:ring-offset-1 active:scale-95 ${
        active ? "ring-2 ring-brand-500 ring-offset-2" : ""
      }`}
    >
      {children}
    </Link>
  );
}

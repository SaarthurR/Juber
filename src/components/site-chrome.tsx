"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps the desktop chrome (top navbar + footer) so it can be hidden on the
 * mobile redesign routes under `/m`, which ship their own bottom tab bar and
 * full-screen phone shell. The `navbar` and `footer` are server-rendered and
 * passed in as props (RSC composition); we simply choose whether to render them.
 */
export function SiteChrome({
  navbar,
  footer,
  children,
}: {
  navbar: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isMobile = pathname === "/m" || pathname?.startsWith("/m/");

  if (isMobile) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      {navbar}
      <main className="flex-1">{children}</main>
      {footer}
    </>
  );
}

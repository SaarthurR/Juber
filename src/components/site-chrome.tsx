"use client";

import { useEffect, useState } from "react";
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
  const [navigationStartedFrom, setNavigationStartedFrom] = useState<string | null>(null);
  const navigating = navigationStartedFrom === pathname;

  useEffect(() => {
    if (!navigating) return;
    const timeout = window.setTimeout(() => setNavigationStartedFrom(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [navigating]);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }

    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target === "_blank") return;

    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    if (`${destination.pathname}${destination.search}` === `${window.location.pathname}${window.location.search}`) return;
    setNavigationStartedFrom(pathname);
  }

  if (isMobile) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <div className="desktop-shell contents" onClick={handleClick}>
      {navbar}
      <span
        aria-hidden="true"
        className={`desktop-nav-progress ${navigating ? "desktop-nav-progress--active" : ""}`}
      />
      <main key={pathname} className="desktop-page flex-1">{children}</main>
      {footer}
    </div>
  );
}

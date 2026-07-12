"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isModerationAllowedPath, bannedPagePath } from "@/lib/moderation";

export function ModerationBannedGate({
  banned,
  children,
}: {
  banned: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = pathname?.startsWith("/m") ?? false;
  const allowed = !banned || (pathname ? isModerationAllowedPath(pathname) : false);

  useEffect(() => {
    if (allowed || !banned) return;
    router.replace(bannedPagePath(isMobile));
  }, [allowed, banned, isMobile, router]);

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <p className="text-lg font-extrabold text-ink">Account suspended</p>
          <p className="mt-2 text-sm text-stone-500">Taking you to account status...</p>
        </div>
      </main>
    );
  }

  return children;
}

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authCallbackDestination } from "@/lib/route-targets";

const ALLOWED_PATHS = new Set(["/profile", "/m/profile/edit"]);

export function ContactRequiredGate({
  required,
  children,
}: {
  required: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = !required || ALLOWED_PATHS.has(pathname) || pathname.startsWith("/auth/");
  const isMobile = pathname.startsWith("/m");
  const profilePath = isMobile ? "/m/profile/edit" : "/profile";

  useEffect(() => {
    if (allowed) return;
    const attemptedPath = `${window.location.pathname}${window.location.search}`;
    const next = authCallbackDestination(attemptedPath, isMobile ? "/m" : "/rides");
    const search = new URLSearchParams({ contact_required: "1", next });
    router.replace(`${profilePath}?${search.toString()}`);
  }, [allowed, isMobile, profilePath, router]);

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <p className="text-lg font-extrabold text-ink">Contact information required</p>
          <p className="mt-2 text-sm text-stone-500">Taking you to your profile...</p>
        </div>
      </main>
    );
  }

  return children;
}

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

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
  const destination = pathname.startsWith("/m")
    ? "/m/profile/edit?contact_required=1"
    : "/profile?contact_required=1";

  useEffect(() => {
    if (!allowed) router.replace(destination);
  }, [allowed, destination, router]);

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

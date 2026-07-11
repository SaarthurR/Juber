"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth-button";
import { authCallbackDestination } from "@/lib/route-targets";
import { useScrollLock } from "@/lib/use-scroll-lock";

export function LandingAuthGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [nextPath, setNextPath] = useState(() => authCallbackDestination(pathname, "/rides"));
  useScrollLock(open);

  function onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-auth-allowed='true']")) return;

    const action = target.closest("a,button");
    if (!action) return;

    const href = action instanceof HTMLAnchorElement
      ? action.getAttribute("href")
      : null;
    setNextPath(authCallbackDestination(href ?? pathname, authCallbackDestination(pathname, "/rides")));
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  }

  return (
    <div onClickCapture={onClickCapture}>
      {children}

      {open && (
        <div
          className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-auth-title"
        >
          <div className="motion-dialog w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-[0_24px_70px_-28px_rgba(28,25,23,0.65)]">
            <div className="flex justify-end">
              <button
                type="button"
                data-auth-allowed="true"
                aria-label="Close sign-in prompt"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              >
                <X size={17} />
              </button>
            </div>
            <h2
              id="landing-auth-title"
              className="mt-1 text-2xl font-extrabold tracking-tight text-ink"
            >
              Sign in to keep going
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              You can browse the scheduled rides here. Signing in unlocks
              details, posting, requests, and messages.
            </p>
            <GoogleSignInButton
              next={nextPath}
              googleBranding
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>
      )}
    </div>
  );
}

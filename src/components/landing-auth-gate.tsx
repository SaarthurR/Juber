"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth-button";
import { DesktopDialog } from "@/components/ui/desktop-dialog";
import { authCallbackDestination } from "@/lib/route-targets";

export function shouldInterceptAuthAction({
  hasAction,
  authAllowed,
}: {
  hasAction: boolean;
  authAllowed: boolean;
}) {
  return hasAction && !authAllowed;
}

export function landingAuthNextPath(href: string | null, pathname: string) {
  return authCallbackDestination(
    href ?? pathname,
    authCallbackDestination(pathname, "/rides"),
  );
}

export function PublicLegalLinks() {
  return (
    <nav
      aria-label="Legal"
      className="flex items-center gap-1 text-[13px] font-bold text-sand-text"
    >
      <Link
        href="/terms"
        data-auth-allowed="true"
        className="inline-flex min-h-11 items-center justify-center rounded-full px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        Terms
      </Link>
      <Link
        href="/privacy"
        data-auth-allowed="true"
        className="inline-flex min-h-11 items-center justify-center rounded-full px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        Privacy
      </Link>
    </nav>
  );
}

export function LandingSignInDialog({
  open,
  onDismiss,
  nextPath,
}: {
  open: boolean;
  onDismiss: () => void;
  nextPath: string;
}) {
  return (
    <DesktopDialog
      open={open}
      onDismiss={onDismiss}
      labelledBy="landing-auth-title"
      closeLabel="Close sign-in prompt"
      overlayClassName="backdrop-blur-sm"
      backdropClassName="bg-stone-950/45"
      className="text-center shadow-[0_24px_70px_-28px_rgba(28,25,23,0.65)]"
    >
      <h2
        id="landing-auth-title"
        className="mt-1 pr-8 text-2xl font-extrabold tracking-tight text-ink"
      >
        Sign in to keep going
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        You can browse the scheduled rides here. Signing in unlocks details,
        posting, requests, and messages.
      </p>
      <GoogleSignInButton
        next={nextPath}
        googleBranding
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      />
    </DesktopDialog>
  );
}

export function LandingAuthGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [nextPath, setNextPath] = useState(() => authCallbackDestination(pathname, "/rides"));

  function onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const action = target.closest("a,button");
    const authAllowed = Boolean(target.closest("[data-auth-allowed='true']"));
    if (!shouldInterceptAuthAction({ hasAction: Boolean(action), authAllowed })) return;

    const href = action instanceof HTMLAnchorElement
      ? action.getAttribute("href")
      : null;
    setNextPath(landingAuthNextPath(href, pathname));
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <div onClickCapture={onClickCapture}>{children}</div>
      <LandingSignInDialog
        open={open}
        onDismiss={() => setOpen(false)}
        nextPath={nextPath}
      />
    </>
  );
}

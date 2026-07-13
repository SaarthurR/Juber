"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authCallbackDestination } from "@/lib/route-targets";

export const GOOGLE_SIGN_IN_ERROR = "Sign-in unavailable. Try again.";

export function GoogleSignInButton({
  next,
  className,
  googleBranding = false,
}: {
  next?: string;
  className?: string;
  googleBranding?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const currentPath = `${window.location.pathname}${window.location.search}`;
      const nextPath = authCallbackDestination(next ?? currentPath, "/rides");
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (signInError) throw signInError;
    } catch {
      setError(GOOGLE_SIGN_IN_ERROR);
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        data-auth-allowed="true"
        className={
          className ??
          "inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 hover:border-stone-400 active:scale-[0.97] active:bg-stone-100 disabled:opacity-60 disabled:cursor-not-allowed"
        }
      >
        {loading ? <Spinner /> : googleBranding && !error ? <GoogleIcon /> : null}
        {loading
          ? "Signing in…"
          : error ?? (googleBranding ? "Sign in with Google" : "Sign in")}
      </button>
      {error && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

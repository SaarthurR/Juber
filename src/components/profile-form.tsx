"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { actionErrorMessage } from "@/lib/action-lifecycle";
import type { ProfileFormState } from "@/lib/profile-save";
import { InlineActionError } from "@/components/inline-action-error";

type ProfileAction = (formData: FormData) => Promise<ProfileFormState>;
type ProfileFormMode = "edit" | "onboarding" | "contact_required";

export function ProfileForm({
  action,
  children,
  variant,
  className,
  mode = "edit",
  skipHref,
}: {
  action: ProfileAction;
  children: ReactNode;
  variant: "desktop" | "mobile";
  className?: string;
  mode?: ProfileFormMode;
  skipHref?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submitLabel =
    mode === "onboarding"
      ? "Continue to app"
      : mode === "contact_required"
        ? "Save and continue"
        : "Save changes";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        setError(result?.error ?? null);
      } catch (actionError) {
        setError(
          actionErrorMessage(
            actionError,
            "We couldn't save your profile. Please try again.",
          ),
        );
      }
    });
  }

  const errorMessage = (
    <InlineActionError
      id="profile-save-error"
      error={error}
      className={
        variant === "mobile"
          ? "mb-2 text-center text-[13px] font-bold text-red-600"
          : "text-sm font-semibold text-red-600"
      }
    />
  );

  const showSkip = mode === "contact_required" && skipHref;

  return (
    <form
      onSubmit={submit}
      className={className}
      aria-busy={pending}
      aria-describedby={error ? "profile-save-error" : undefined}
    >
      {children}
      {variant === "desktop" ? (
        <>
          {errorMessage}
          <div className="space-y-3">
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 w-full rounded-xl bg-brand-600 px-5 py-4 font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Saving..." : submitLabel}
            </button>
            {showSkip && (
              <div className="space-y-1 text-center">
                <Link
                  href={skipHref}
                  className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
                >
                  Keep browsing for now
                </Link>
                <p className="text-xs text-stone-500">
                  You can finish contact info later. We will ask again when you book, post, or message.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-border-soft bg-cream px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          {errorMessage}
          <button
            type="submit"
            disabled={pending}
            className="h-[54px] w-full rounded-[14px] bg-brand-600 text-[15px] font-bold text-white shadow-[0_14px_24px_-12px_rgba(166,83,41,0.7)] transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving..." : submitLabel}
          </button>
          {showSkip && (
            <div className="mt-2 space-y-1 text-center">
              <Link
                href={skipHref}
                className="inline-flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-brand-600 underline-offset-2 hover:underline"
              >
                Keep browsing for now
              </Link>
              <p className="text-[11px] text-muted-warm">
                You can finish contact info later. We will ask again when you book, post, or message.
              </p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

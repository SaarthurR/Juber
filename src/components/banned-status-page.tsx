"use client";

import { useActionState, useId } from "react";
import { ShieldAlert } from "lucide-react";
import { SignOutFormView } from "@/components/sign-out-form";
import { FormField } from "@/components/form-bits";
import { InlineActionError } from "@/components/inline-action-error";
import { PendingActionButton, PendingActionGroup } from "@/components/pending-action-button";
import { signOutAction } from "@/app/auth/actions";
import {
  MODERATION_ACTION_INITIAL,
  submitAppealAction,
} from "@/app/moderation/actions";
import { TempleLogo } from "@/components/temple-logo";
import { APP_NAME } from "@/lib/constants";
import { formatBanExpiry, type ModerationBan } from "@/lib/moderation";

export function BannedStatusView({
  ban,
  hasPendingAppeal,
  variant = "desktop",
}: {
  ban: ModerationBan;
  hasPendingAppeal: boolean;
  variant?: "desktop" | "mobile";
}) {
  const mobile = variant === "mobile";
  const [appealState, appealAction] = useActionState(
    submitAppealAction,
    MODERATION_ACTION_INITIAL,
  );
  const [signOutState, signOutFormAction] = useActionState(signOutAction, null);
  const appealErrorId = useId();

  return (
    <div
      className={
        mobile
          ? "min-h-screen bg-cream px-4 py-10"
          : "mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-16 sm:px-6"
      }
    >
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_18px_44px_-36px_rgba(28,25,23,0.35)]">
        <div className="flex items-center gap-2 text-brand-600">
          <TempleLogo size={22} className="text-brand-600" aria-hidden />
          <span className="text-sm font-extrabold tracking-[-0.02em]">{APP_NAME}</span>
        </div>

        <div className="mt-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <ShieldAlert size={22} aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Account suspended</h1>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              You cannot browse rides, messages, or profiles while this suspension is active.
            </p>
          </div>
        </div>

        <dl className="mt-6 space-y-3 rounded-xl bg-stone-50 px-4 py-3 text-sm">
          <div>
            <dt className="font-bold text-ink">Reason</dt>
            <dd className="mt-1 text-stone-600">{ban.reason}</dd>
          </div>
          <div>
            <dt className="font-bold text-ink">Ends</dt>
            <dd className="mt-1 text-stone-600">{formatBanExpiry(ban.expires_at)}</dd>
          </div>
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-stone-500">
          Your access is blocked right away. If you still see this page after your suspension ends,
          sign out and sign back in to continue.
        </p>

        {hasPendingAppeal ? (
          <p className="mt-6 rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800" role="status">
            Your appeal is pending review.
          </p>
        ) : (
          <section className="mt-6 border-t border-stone-100 pt-6" aria-labelledby="appeal-heading">
            <h2 id="appeal-heading" className="text-base font-extrabold text-ink">
              Submit an appeal
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Explain why this suspension should be lifted. You can submit one appeal per ban.
            </p>
            <PendingActionGroup>
              <form action={appealAction} className="mt-4 space-y-4">
                <FormField
                  label="Appeal message"
                  name="text"
                  textarea
                  required
                  maxLength={2000}
                  placeholder="Tell us what happened and why access should be restored."
                  ariaDescribedBy={appealErrorId}
                />
                <InlineActionError
                  id={appealErrorId}
                  error={appealState.status === "error" ? appealState.message : null}
                  className="text-sm font-semibold text-red-600"
                />
                {appealState.status === "success" && (
                  <p className="text-sm font-semibold text-emerald-700" role="status">
                    {appealState.message}
                  </p>
                )}
                <PendingActionButton
                  actionKey="submit-appeal"
                  pendingLabel="Submitting..."
                  className="flex h-11 w-full items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Submit appeal
                </PendingActionButton>
              </form>
            </PendingActionGroup>
          </section>
        )}

        <div className="mt-8 border-t border-stone-100 pt-5">
          <SignOutFormView
            variant={mobile ? "mobile" : "desktop"}
            state={signOutState}
            formAction={signOutFormAction}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { ShieldAlert } from "lucide-react";
import { SignOutFormView } from "@/components/sign-out-form";
import { FormField } from "@/components/form-bits";
import { InlineActionError } from "@/components/inline-action-error";
import { PendingActionButton, PendingActionGroup } from "@/components/pending-action-button";
import { signOutAction } from "@/app/auth/actions";
import { submitAppealAction } from "@/app/moderation/actions";
import { TempleLogo } from "@/components/temple-logo";
import { APP_NAME } from "@/lib/constants";
import {
  formatBanExpiry,
  formatBanLength,
  type ModerationAppeal,
  type ModerationBan,
  type ModerationOutcome,
} from "@/lib/moderation";
import { MODERATION_ACTION_INITIAL } from "@/lib/moderation-action-state";

export function BannedStatusView({
  ban,
  hasPendingAppeal,
  appeal = null,
  variant = "desktop",
  focusHeading = false,
  refreshError = null,
  onRetry,
  unacknowledgedOutcome = null,
  outcomePending = false,
  onAcknowledgeOutcome,
}: {
  ban: ModerationBan;
  hasPendingAppeal: boolean;
  appeal?: ModerationAppeal | null;
  variant?: "desktop" | "mobile";
  focusHeading?: boolean;
  refreshError?: string | null;
  onRetry?: () => void;
  unacknowledgedOutcome?: ModerationOutcome | null;
  outcomePending?: boolean;
  onAcknowledgeOutcome?: () => void;
}) {
  const mobile = variant === "mobile";
  const [appealState, appealAction] = useActionState(
    submitAppealAction,
    MODERATION_ACTION_INITIAL,
  );
  const [signOutState, signOutFormAction] = useActionState(signOutAction, null);
  const appealErrorId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [ban.ban_id, focusHeading]);

  return (
    <main
      className={
        mobile
          ? "min-h-[100dvh] bg-cream px-4 py-8"
          : "flex min-h-[100dvh] w-full flex-col items-center justify-center bg-cream px-4 py-12 sm:px-6"
      }
    >
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_18px_44px_-36px_rgba(28,25,23,0.35)]">
        <div className="flex items-center gap-2 text-brand-600">
          <TempleLogo size={22} className="text-brand-600" aria-hidden />
          <span className="text-sm font-extrabold tracking-[-0.02em]">{APP_NAME}</span>
        </div>

        <div className="mt-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <ShieldAlert size={22} aria-hidden />
          </div>
          <div>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-extrabold text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4"
            >
              Account suspended
            </h1>
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
            <dt className="font-bold text-ink">Length</dt>
            <dd className="mt-1 text-stone-600">{formatBanLength(ban)}</dd>
          </div>
          <div>
            <dt className="font-bold text-ink">End date</dt>
            <dd className="mt-1 text-stone-600">{formatBanExpiry(ban.expires_at)}</dd>
          </div>
        </dl>

        <section className="mt-5" aria-labelledby="restrictions-heading">
          <h2 id="restrictions-heading" className="text-sm font-extrabold text-ink">
            Restrictions
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>You cannot browse rides or profiles.</li>
            <li>You cannot send or read messages.</li>
            <li>You may submit an appeal and sign out.</li>
          </ul>
        </section>

        <p className="mt-4 text-xs leading-relaxed text-stone-500">
          Your access is blocked right away. After the end date, refresh this page. If access has
          not returned, sign out and sign back in to continue.
        </p>

        {refreshError ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="status">
            <p className="text-sm font-semibold text-red-800">{refreshError}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-red-300 bg-white px-4 text-sm font-bold text-red-800 transition hover:bg-red-50 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
              >
                Retry account status
              </button>
            ) : null}
          </div>
        ) : null}

        {unacknowledgedOutcome ? (
          <section className="mt-5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3" aria-labelledby="moderation-outcome-heading">
            <h2 id="moderation-outcome-heading" className="text-sm font-extrabold text-ink">
              {unacknowledgedOutcome.type === "appeal_denied" ? "Appeal decision" : "Suspension notice"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-stone-700">
              {unacknowledgedOutcome.type === "appeal_denied"
                ? "Your appeal was not granted. This suspension remains active."
                : "Your suspension is active with the restrictions shown above."}
            </p>
            {onAcknowledgeOutcome ? (
              <button
                type="button"
                onClick={onAcknowledgeOutcome}
                disabled={outcomePending}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-brand-300 bg-white px-4 text-sm font-bold text-brand-800 transition hover:bg-brand-50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                {outcomePending ? "Saving..." : "Acknowledge notice"}
              </button>
            ) : null}
          </section>
        ) : null}

        {hasPendingAppeal ? (
          <p className="mt-6 rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800" role="status">
            Your appeal is pending review.
          </p>
        ) : (
          <>
            {appeal?.status === "denied" && (
              <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="status">
                Your appeal was not granted. You may submit another appeal while this suspension remains active.
              </p>
            )}
            <section className="mt-6 border-t border-stone-100 pt-6" aria-labelledby="appeal-heading">
              <h2 id="appeal-heading" className="text-base font-extrabold text-ink">
                Submit an appeal
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Explain why this suspension should be lifted. Only one appeal can be pending at a time.
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
          </>
        )}

        <div className="mt-8 border-t border-stone-100 pt-5">
          <SignOutFormView
            variant={mobile ? "mobile" : "desktop"}
            state={signOutState}
            formAction={signOutFormAction}
          />
        </div>
      </div>
    </main>
  );
}

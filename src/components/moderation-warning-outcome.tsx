"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import type { ModerationWarning } from "@/lib/moderation";

export function ModerationWarningOutcome({
  warning,
  pending,
  error,
  focusHeading,
  onAcknowledge,
}: {
  warning: ModerationWarning;
  pending: boolean;
  error: string | null;
  focusHeading: boolean;
  onAcknowledge: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const acknowledgeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading, warning.outcomeId]);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-cream px-4 py-8 sm:px-6 sm:py-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moderation-warning-heading"
      aria-describedby="moderation-warning-summary"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        event.preventDefault();
        acknowledgeRef.current?.focus();
      }}
    >
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-lg items-center sm:min-h-[calc(100dvh-6rem)]">
        <div className="w-full rounded-2xl border border-amber-200 bg-white p-6 shadow-[0_18px_44px_-36px_rgba(120,83,24,0.45)] sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
            <AlertTriangle size={22} aria-hidden />
          </div>
          <h1
            id="moderation-warning-heading"
            ref={headingRef}
            tabIndex={-1}
            className="mt-5 text-2xl font-extrabold text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4"
          >
            Community warning
          </h1>
          <p id="moderation-warning-summary" className="mt-2 text-sm leading-relaxed text-stone-600">
            Please review this warning before continuing to use Juber.
          </p>

          <dl className="mt-6 space-y-4 rounded-xl bg-amber-50 px-4 py-4 text-sm">
            <div>
              <dt className="font-extrabold text-ink">Reason</dt>
              <dd className="mt-1 leading-relaxed text-stone-700">
                {warning.note?.trim() || "Recent activity did not follow the community guidelines."}
              </dd>
            </div>
            <div>
              <dt className="font-extrabold text-ink">Restrictions</dt>
              <dd className="mt-1 leading-relaxed text-stone-700">
                You may continue using Juber, but you must follow the community guidelines.
                Further violations can limit or suspend your access.
              </dd>
            </div>
          </dl>

          {error ? (
            <p className="mt-4 text-sm font-semibold text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <button
            ref={acknowledgeRef}
            type="button"
            onClick={onAcknowledge}
            disabled={pending}
            className="mt-6 flex h-11 w-full items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-bold text-white transition hover:bg-brand-700 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving..." : "I understand"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ModerationWarningArrival({ onReview }: { onReview: () => void }) {
  return (
    <div
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] mx-auto max-w-sm rounded-2xl border border-amber-200 bg-white p-4 shadow-[0_18px_44px_-24px_rgba(120,83,24,0.4)]"
      role="status"
    >
      <p className="text-sm font-extrabold text-ink">A community warning is ready to review.</p>
      <button
        type="button"
        onClick={onReview}
        className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-bold text-white transition hover:bg-brand-700 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      >
        Review warning
      </button>
    </div>
  );
}

export function ModerationRefreshError({
  onRetry,
  fullScreen = false,
}: {
  onRetry: () => void;
  fullScreen?: boolean;
}) {
  return (
    <div
      className={fullScreen
        ? "fixed inset-0 z-[60] flex min-h-[100dvh] items-center justify-center bg-cream px-4 py-8"
        : "fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] mx-auto max-w-sm"}
      role="status"
    >
      <div className="w-full max-w-sm rounded-2xl border border-red-200 bg-white p-4 shadow-[0_18px_44px_-24px_rgba(127,29,29,0.3)]">
        <p className="text-sm font-semibold text-stone-700">
          We could not refresh your account status.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-ink transition hover:bg-stone-50 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
